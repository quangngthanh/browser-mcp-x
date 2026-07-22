#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════
# Browser MCP X Relay — Zero-dependency MCP bridge
# Run: python3 relay.py
# Connects AI agents (Claude, Cursor, etc.) via stdio to
# the Browser MCP X Chrome extension via WebSocket.
#
# No npm. No node. No pip. Just python3 (pre-installed on
# macOS/Linux, tiny download on Windows).
# ═══════════════════════════════════════════════════════════

import json
import sys
import threading
import time
import socket
import struct
import hashlib
import base64
import queue
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

MCP_PORT = 9275
WS_PORT = 9274  # WebSocket port for extension connection
VERSION = "0.4.1"

# ─── WebSocket Server (hand-rolled, zero deps) ───

class WebSocketFrame:
    @staticmethod
    def encode(data: str) -> bytes:
        """Encode a server-to-browser WebSocket text frame.

        Per RFC 6455, client-to-server frames MUST be masked, but
        server-to-client frames MUST NOT be masked. Browser clients close the
        connection with a protocol error if the server masks outbound frames.
        """
        payload = data.encode("utf-8")
        payload_len = len(payload)
        if payload_len < 126:
            header = bytes([0x81, payload_len])
        elif payload_len < 65536:
            header = bytes([0x81, 126]) + struct.pack(">H", payload_len)
        else:
            header = bytes([0x81, 127]) + struct.pack(">Q", payload_len)
        return header + payload

    @staticmethod
    def decode(data: bytes) -> str:
        if len(data) < 6:
            return ""
        payload_len = data[1] & 0x7F
        offset = 2
        if payload_len == 126:
            payload_len = struct.unpack(">H", data[2:4])[0]
            offset = 4
        elif payload_len == 127:
            payload_len = struct.unpack(">Q", data[2:10])[0]
            offset = 10
        if len(data) < offset + 4 + payload_len:
            return ""
        mask = data[offset:offset + 4]
        offset += 4
        payload = bytearray(data[offset:offset + payload_len])
        for i in range(len(payload)):
            payload[i] ^= mask[i % 4]
        return payload.decode("utf-8")


class ExtensionClient:
    def __init__(self, conn, addr):
        self.conn = conn
        self.addr = addr
        self.alive = True
        self._buf = b""

    def _read_bytes(self, n: int) -> bytes:
        """Read exactly n bytes, accumulating across TCP packets."""
        while len(self._buf) < n:
            chunk = self.conn.recv(65536)
            if not chunk:
                self.alive = False
                raise ConnectionError("Connection closed")
            self._buf += chunk
        data, self._buf = self._buf[:n], self._buf[n:]
        return data

    def send(self, data: str) -> bool:
        try:
            self.conn.sendall(WebSocketFrame.encode(data))
            return True
        except Exception:
            self.alive = False
            return False

    def _read_frame(self):
        """Read one WebSocket frame, returning (fin, opcode, payload_bytes)."""
        header = self._read_bytes(2)
        fin = (header[0] & 0x80) != 0
        opcode = header[0] & 0x0F
        masked = (header[1] & 0x80) != 0
        payload_len = header[1] & 0x7F

        if payload_len == 126:
            payload_len = struct.unpack(">H", self._read_bytes(2))[0]
        elif payload_len == 127:
            payload_len = struct.unpack(">Q", self._read_bytes(8))[0]

        mask_key = self._read_bytes(4) if masked else b""
        payload = bytearray(self._read_bytes(payload_len))

        if masked:
            for i in range(len(payload)):
                payload[i] ^= mask_key[i % 4]

        return fin, opcode, bytes(payload)

    def recv(self) -> str:
        """Read one complete WebSocket message, reassembling fragmented
        frames (large messages are commonly split across multiple frames
        with opcode 0x0 continuation frames and FIN=0 until the last one)."""
        try:
            fin, opcode, payload = self._read_frame()

            if opcode == 0x8:  # close frame
                self.alive = False
                return ""
            if opcode == 0x9:  # ping -> pong
                self.conn.sendall(bytes([0x8A, 0]))
                return ""
            if opcode == 0xA:  # pong
                return ""

            chunks = [payload]
            while not fin:
                frag_fin, frag_opcode, frag_payload = self._read_frame()
                if frag_opcode == 0x8:
                    self.alive = False
                    return ""
                chunks.append(frag_payload)
                fin = frag_fin

            return b"".join(chunks).decode("utf-8")
        except Exception:
            self.alive = False
            return ""

    def close(self):
        try:
            self.conn.close()
        except:
            pass
        self.alive = False


extension_client = None
extension_lock = threading.Lock()
pending_responses = {}
pending_lock = threading.Lock()


def handle_extension_connection(conn, addr):
    global extension_client
    print(f"[Browser MCP X] Extension connected from {addr}", file=sys.stderr)

    # Send MCP initialize to verify connection
    init_msg = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"clientInfo": {"name": "browser-mcp-relay", "version": VERSION}}
    })

    # Read the WebSocket handshake first
    try:
        handshake_data = conn.recv(4096).decode("utf-8")
        if "Sec-WebSocket-Key" in handshake_data:
            key = handshake_data.split("Sec-WebSocket-Key: ")[1].split("\r\n")[0].strip()
            accept = base64.b64encode(
                hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()
            ).decode()
            response = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            )
            conn.sendall(response.encode())
    except Exception as e:
        print(f"[Browser MCP X] Handshake error: {e}", file=sys.stderr)
        conn.close()
        return

    client = ExtensionClient(conn, addr)
    with extension_lock:
        extension_client = client

    # Listen for responses from extension. If an HTTP /mcp request is waiting
    # for this JSON-RPC id, deliver it there; otherwise forward to stdout for
    # classic stdio MCP clients.
    while client.alive:
        msg = client.recv()
        if msg:
            try:
                parsed = json.loads(msg)
                msg_id = parsed.get("id")
                if msg_id is not None:
                    with pending_lock:
                        pending = pending_responses.get(msg_id)
                    if pending:
                        pending.put(parsed)
                        continue
                sys.stdout.write(json.dumps(parsed) + "\n")
                sys.stdout.flush()
            except Exception:
                pass

    print("[Browser MCP X] Extension disconnected", file=sys.stderr)
    with extension_lock:
        if extension_client is client:
            extension_client = None


def try_bind_ws_server():
    """Try to exclusively bind the WebSocket port. Returns socket or None.
    No SO_REUSEADDR — the bind result is the distributed mutex between relay instances.
    """
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        server.bind(("127.0.0.1", WS_PORT))
        server.listen(5)
        return server
    except OSError:
        server.close()
        return None


def run_ws_server(server: socket.socket):
    print(f"[Browser MCP X] WebSocket server listening on port {WS_PORT}", file=sys.stderr)
    print(f"[Browser MCP X] Waiting for Chrome extension to connect...", file=sys.stderr)
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_extension_connection, args=(conn, addr), daemon=True).start()


# ─── stdio MCP handler ───

STATIC_TOOLS = [
    {"name": "navigate", "description": "Navigate the active tab to a URL", "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}},
    {"name": "screenshot", "description": "Take a screenshot of the active tab", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_dom", "description": "Extract the DOM structure of the active tab as text (simplified accessibility tree)", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string", "default": "body"}}}},
    {"name": "click", "description": "Click an element by CSS selector", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}, "required": ["selector"]}},
    {"name": "type_text", "description": "Type text into an input, textarea, or contenteditable / rich-text editor. Uses native setters + insertText so React-controlled fields update.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}, "text": {"type": "string"}}, "required": ["selector", "text"]}},
    {"name": "extract_text", "description": "Extract text content from the active tab, optionally from a specific selector", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string", "default": "body"}}}},
    {"name": "scroll", "description": "Scroll the page or a specific element (e.g. a dialog overlay) by a given amount", "inputSchema": {"type": "object", "properties": {"direction": {"type": "string", "enum": ["up", "down"], "default": "down"}, "amount": {"type": "number", "default": 500}, "selector": {"type": "string", "description": "CSS selector of the scrollable container; omit to scroll the page"}}}},
    {"name": "get_tabs", "description": "List all open tabs with their IDs, titles, and URLs", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "switch_tab", "description": "Switch to a specific tab by its ID", "inputSchema": {"type": "object", "properties": {"tabId": {"type": "number"}}, "required": ["tabId"]}},
    {"name": "close_tab", "description": "Close a tab by its ID", "inputSchema": {"type": "object", "properties": {"tabId": {"type": "number"}}, "required": ["tabId"]}},
    {"name": "evaluate", "description": "Run JavaScript in the active tab. Awaits Promises. Objects are JSON-serialized.", "inputSchema": {"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]}},
    {"name": "get_page_info", "description": "Get metadata about the current page (title, URL, viewport size)", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "fill_form", "description": "Fill multiple form fields at once. Pass an object of {selector: value} pairs.", "inputSchema": {"type": "object", "properties": {"fields": {"type": "object"}}, "required": ["fields"]}},
    {"name": "wait", "description": "Wait for a specified number of milliseconds", "inputSchema": {"type": "object", "properties": {"ms": {"type": "number", "default": 1000}}}},
    {"name": "press_key", "description": "Press a key on the focused element. Supports combos like 'Enter', 'Escape', 'Control+a', 'Ctrl+Enter'.", "inputSchema": {"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]}},
    {"name": "download_image", "description": "Download a page image to the user's Downloads folder via canvas capture (avoids CORS). Prefer over fetch(img.src).", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string", "description": "CSS selector for <img>. If omitted or not found, downloads the largest image on the page."}, "filename": {"type": "string", "description": "Filename, e.g. image.png"}}}},
    {"name": "get_links", "description": "Extract all links from the page with their text and href", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "start_recording", "description": "Start recording browser actions (clicks, inputs, navigations) for later playback", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "stop_recording", "description": "Stop recording and return the recorded action sequence as JSON", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "playback", "description": "Replay a previously recorded action sequence. Pass the actions array from stop_recording.", "inputSchema": {"type": "object", "properties": {"actions": {"type": "array"}, "speed": {"type": "number", "default": 1}}, "required": ["actions"]}},
    {"name": "detect_forms", "description": "Auto-detect all forms on the page with their fields, types, labels, and selectors", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "auto_fill_form", "description": "Auto-fill a form with AI-generated values. Detects the form and suggests values based on field types/names.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string", "default": "form"}, "values": {"type": "object"}}}},
    {"name": "create_tab", "description": "Create a new tab with an optional URL", "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}, "active": {"type": "boolean", "default": True}}}},
    {"name": "batch_execute", "description": "Execute multiple tool calls in sequence on a specific tab. Pass an array of {tool, args} objects.", "inputSchema": {"type": "object", "properties": {"tabId": {"type": "number"}, "steps": {"type": "array"}}, "required": ["steps"]}},
    {"name": "get_console_logs", "description": "Capture console logs from the active tab (errors, warnings, logs)", "inputSchema": {"type": "object", "properties": {"level": {"type": "string", "enum": ["error", "warn", "log", "all"], "default": "all"}}}},
    {"name": "get_network_requests", "description": "Capture recent network requests from the active tab (URL, method, status, type, headers, payload)", "inputSchema": {"type": "object", "properties": {"filter": {"type": "string", "default": ""}, "type": {"type": "string", "enum": ["all", "xmlhttprequest", "fetch", "script", "main_frame", "sub_frame"], "default": "all"}, "limit": {"type": "number", "default": 50}, "includeHeaders": {"type": "boolean", "default": True}}}},
    {"name": "get_api_requests", "description": "Capture API calls (XHR/Fetch) with full HTTP headers, Auth Tokens, parameters, and request body payloads for direct API re-play.", "inputSchema": {"type": "object", "properties": {"filter": {"type": "string", "default": ""}, "limit": {"type": "number", "default": 20}}}},
    {"name": "get_curl_command", "description": "Generate a copy-pasteable cURL command for a captured network request (including auth headers and payload) to execute directly without UI.", "inputSchema": {"type": "object", "properties": {"urlPattern": {"type": "string"}, "requestIndex": {"type": "number", "default": 0}}, "required": ["urlPattern"]}},
    {"name": "export_api_session", "description": "Export authentication cookies, bearer tokens, and headers for a domain. Returns JSON + ready-to-run Python requests script to call APIs headlessly.", "inputSchema": {"type": "object", "properties": {"domain": {"type": "string", "default": ""}}}},
    {"name": "highlight", "description": "Visually highlight an element with a colored border. Pass a CSS selector. Pass duration=0 to remove all highlights.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}, "color": {"type": "string", "default": "#E55934"}, "duration": {"type": "number", "default": 3000}}, "required": ["selector"]}},
    {"name": "wait_for_element", "description": "Wait until an element matching the CSS selector appears on the page. Auto-resolves when found or after timeout.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}, "timeout": {"type": "number", "default": 10000}, "visible": {"type": "boolean", "default": True}}, "required": ["selector"]}},
    {"name": "get_interactive_elements", "description": "List all interactive elements (buttons, links, inputs, selects) with numeric IDs. Use the returned ID with click_by_id or type_by_id.", "inputSchema": {"type": "object", "properties": {"filter": {"type": "string", "enum": ["all", "buttons", "links", "inputs", "forms"], "default": "all"}}}},
    {"name": "click_by_id", "description": "Click an element by its interactive ID (from get_interactive_elements). Much easier than CSS selectors.", "inputSchema": {"type": "object", "properties": {"elementId": {"type": "number"}}, "required": ["elementId"]}},
    {"name": "type_by_id", "description": "Type text into the element with the given interactive ID (from get_interactive_elements).", "inputSchema": {"type": "object", "properties": {"elementId": {"type": "number"}, "text": {"type": "string"}}, "required": ["elementId", "text"]}},
    {"name": "click_text", "description": "Click an element by its visible text content. e.g. click_text({text: 'Submit'}). Searches buttons, links, and all visible elements.", "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}, "partial": {"type": "boolean", "default": True}}, "required": ["text"]}},
    {"name": "hover", "description": "Hover over an element by CSS selector. Triggers mouseenter/mouseover events.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}, "required": ["selector"]}},
    {"name": "drag_and_drop", "description": "Drag an element from a source selector to a target selector. Uses HTML5 drag events.", "inputSchema": {"type": "object", "properties": {"source": {"type": "string"}, "target": {"type": "string"}}, "required": ["source", "target"]}},
    {"name": "handle_dialog", "description": "Accept or dismiss a JavaScript dialog (alert, confirm, prompt). Also can type text into a prompt.", "inputSchema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["accept", "dismiss"], "default": "accept"}, "text": {"type": "string"}}}},
    {"name": "get_markdown", "description": "Convert the current page content to structured Markdown. Headings, lists, tables, links, and code blocks are preserved semantically.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string", "default": "body"}, "max_length": {"type": "number", "default": 10000}}}},
    {"name": "snapshot", "description": "Capture the ARIA accessibility tree of the current page. Returns semantic roles, labels, and states (checked, disabled, expanded, value...). Use this to understand page structure before acting, or to verify what changed after an action.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "select_option", "description": "Select an option in a <select> dropdown by value, visible text, or index. Returns confirmation and updated page snapshot.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}, "value": {"type": "string"}, "text": {"type": "string"}, "index": {"type": "number"}}, "required": ["selector"]}},
    {"name": "file_upload", "description": "Upload a file to an <input type=\"file\"> element. Provide the file content as base64 and the filename.", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string", "description": "CSS selector for the file input element"}, "filename": {"type": "string", "description": "Filename (e.g. 'document.pdf')"}, "mimeType": {"type": "string", "description": "MIME type (e.g. 'image/jpeg')", "default": "application/octet-stream"}, "base64Data": {"type": "string", "description": "Base64-encoded file content"}}, "required": ["selector", "filename", "base64Data"]}},
    {"name": "resize_window", "description": "Resize the current browser window to specified dimensions", "inputSchema": {"type": "object", "properties": {"width": {"type": "number", "description": "Window width in pixels"}, "height": {"type": "number", "description": "Window height in pixels"}, "left": {"type": "number", "description": "Window left position in pixels"}, "top": {"type": "number", "description": "Window top position in pixels"}}}},
    {"name": "computer", "description": "Computer-use style interaction: coordinate-based click/scroll, type text, or press keys. Returns a screenshot after each action for visual confirmation.", "inputSchema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["left_click", "right_click", "middle_click", "double_click", "mouse_move", "type", "key", "scroll"], "description": "Action to perform"}, "x": {"type": "number", "description": "X coordinate in pixels (for click/move/scroll actions)"}, "y": {"type": "number", "description": "Y coordinate in pixels (for click/move/scroll actions)"}, "text": {"type": "string", "description": "Text to type (for 'type' action)"}, "key": {"type": "string", "description": "Key combo to press, e.g. 'Enter', 'Control+a' (for 'key' action)"}, "direction": {"type": "string", "enum": ["up", "down", "left", "right"], "description": "Scroll direction (for 'scroll' action)", "default": "down"}, "amount": {"type": "number", "description": "Scroll amount in pixels (for 'scroll' action)", "default": 300}}, "required": ["action"]}},
]


def is_extension_connected() -> bool:
    with extension_lock:
        return bool(extension_client and extension_client.alive)


def wait_for_extension(timeout: float = 15.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if is_extension_connected():
            return True
        time.sleep(0.2)
    return False


def call_extension_sync(msg: dict, timeout: float = 30.0) -> dict:
    """Forward an MCP request to the extension and wait for its JSON-RPC response."""
    msg_id = msg.get("id")
    if msg_id is None:
        msg_id = int(time.time() * 1000)
        msg["id"] = msg_id

    with extension_lock:
        client = extension_client if extension_client and extension_client.alive else None
    if not client:
        return {
            "jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32000, "message": "Browser extension not connected. Open Browser MCP X and click Start."}
        }

    response_queue = queue.Queue(maxsize=1)
    with pending_lock:
        pending_responses[msg_id] = response_queue
    try:
        if not client.send(json.dumps(msg)):
            return {
                "jsonrpc": "2.0", "id": msg_id,
                "error": {"code": -32001, "message": "Failed to send request to Browser MCP X extension."}
            }
        try:
            return response_queue.get(timeout=timeout)
        except queue.Empty:
            return {
                "jsonrpc": "2.0", "id": msg_id,
                "error": {"code": -32002, "message": f"Timeout waiting for Browser MCP X response after {timeout}s."}
            }
    finally:
        with pending_lock:
            pending_responses.pop(msg_id, None)


def send_stdio(msg: dict):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def handle_stdio_message(msg: dict):
    """Handle one MCP JSON-RPC message without requiring extension for handshake."""
    method = msg.get("method")
    msg_id = msg.get("id")

    # Notifications have no id / no response
    if method == "notifications/initialized":
        print("[Browser MCP X] Client initialized", file=sys.stderr)
        return

    if method == "initialize":
        # Answer locally so Cursor can connect even before Chrome extension is ready
        send_stdio({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "browser-mcp-x", "version": VERSION},
            },
        })
        return

    if method == "ping":
        send_stdio({"jsonrpc": "2.0", "id": msg_id, "result": {}})
        return

    if method == "tools/list":
        if is_extension_connected():
            resp = call_extension_sync(msg, timeout=10.0)
            if "error" not in resp:
                send_stdio(resp)
                return
        send_stdio({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": STATIC_TOOLS}})
        return

    if method == "tools/call":
        if not is_extension_connected():
            print("[Browser MCP X] Waiting for Chrome extension...", file=sys.stderr)
            if not wait_for_extension(15.0):
                send_stdio({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32000,
                        "message": "Browser extension not connected. Install Browser MCP X, open it, and click Start.",
                    },
                })
                return
        send_stdio(call_extension_sync(msg, timeout=60.0))
        return

    # Other methods: try extension, else method-not-found
    if is_extension_connected():
        send_stdio(call_extension_sync(msg, timeout=30.0))
    else:
        send_stdio({
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        })


def handle_stdio():
    """Read MCP requests from stdin; handshake locally, tool calls via extension."""
    print("[Browser MCP X] Relay ready. Connect your MCP client via stdio.", file=sys.stderr)
    print(f"[Browser MCP X] WebSocket endpoint: ws://127.0.0.1:{WS_PORT}", file=sys.stderr)
    print(f"[Browser MCP X] HTTP status endpoint: http://127.0.0.1:{MCP_PORT}", file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        try:
            handle_stdio_message(msg)
        except Exception as e:
            print(f"[Browser MCP X] Error handling message: {e}", file=sys.stderr)
            if msg.get("id") is not None:
                send_stdio({
                    "jsonrpc": "2.0",
                    "id": msg.get("id"),
                    "error": {"code": -32603, "message": str(e)},
                })


# ─── HTTP status endpoint (for health checks) ───

class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        with extension_lock:
            connected = extension_client and extension_client.alive

        if self.path == "/license":
            # Ask the extension for current license status.
            license_resp = call_extension_sync({
                "jsonrpc": "2.0", "id": "license-status", "method": "tools/call",
                "params": {"name": "evaluate", "arguments": {"script": "JSON.stringify({valid: typeof proLicenseValid !== 'undefined' ? proLicenseValid : false, key: typeof proLicenseKey !== 'undefined' ? proLicenseKey : null, hasStorage: !!chrome.storage})"}}
            }, timeout=5.0)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(license_resp, indent=2).encode())
            return

        status = {
            "name": "browser-mcp-x",
            "version": VERSION,
            "extension_connected": bool(connected),
            "ws_port": WS_PORT,
            "mcp_port": MCP_PORT,
            "tools": [
                # Browser control
                "navigate", "screenshot", "get_dom", "click", "type_text",
                "extract_text", "scroll", "get_page_info",
                # Page content
                "get_links", "get_markdown",
                # Tabs
                "get_tabs", "switch_tab", "close_tab", "create_tab", "batch_execute",
                # Forms
                "fill_form", "detect_forms", "auto_fill_form", "drag_and_drop",
                # Recording / playback
                "start_recording", "stop_recording", "playback",
                # Debugging
                "evaluate", "wait", "press_key", "download_image", "get_console_logs",
                "get_network_requests", "get_api_requests", "get_curl_command", "export_api_session", "handle_dialog",
                # Smart interaction
                "highlight", "wait_for_element", "get_interactive_elements",
                "click_by_id", "type_by_id", "click_text", "hover",
                "snapshot", "select_option"
            ]
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(status, indent=2).encode())

    def do_POST(self):
        if self.path == "/restart-ws":
            global extension_client
            with extension_lock:
                was_connected = bool(extension_client and extension_client.alive)
                if extension_client:
                    extension_client.close()
                extension_client = None
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "restarted": was_connected,
                "message": "Closed extension WebSocket connection; extension will auto-reconnect." if was_connected
                           else "No active extension connection to restart."
            }).encode())
            return

        if self.path != "/mcp":
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            msg = json.loads(body)
        except Exception as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Invalid JSON body: {e}"}
            }).encode())
            return

        response = call_extension_sync(msg, timeout=30.0)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(response).encode())

    def log_message(self, format, *args):
        pass  # Suppress default logging


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

def start_http_status():
    server = ThreadedHTTPServer(("0.0.0.0", MCP_PORT), StatusHandler)
    server.serve_forever()


# ─── Proxy mode: forward stdio → existing relay HTTP ───

def detect_running_relay() -> bool:
    """Return True if another relay already owns the WebSocket port."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind(("127.0.0.1", WS_PORT))
        probe.close()
        return False  # port free → no relay running
    except OSError:
        return True   # port taken → relay already running


def handle_stdio_proxy():
    """Proxy mode: relay.py already running — forward stdio MCP to its HTTP endpoint."""
    import urllib.request as _req
    print(f"[Browser MCP X] Relay already running. Proxy mode → http://127.0.0.1:{MCP_PORT}/mcp", file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue

        method = msg.get("method")
        msg_id = msg.get("id")

        # Handle handshake locally — no round-trip needed
        if method == "notifications/initialized":
            continue
        if method == "initialize":
            send_stdio({
                "jsonrpc": "2.0", "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "browser-mcp-x", "version": VERSION},
                },
            })
            continue
        if method == "ping":
            send_stdio({"jsonrpc": "2.0", "id": msg_id, "result": {}})
            continue

        # Forward everything else to the running relay's HTTP /mcp endpoint
        try:
            body = json.dumps(msg).encode()
            request = _req.Request(
                f"http://127.0.0.1:{MCP_PORT}/mcp",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            resp = _req.urlopen(request, timeout=65)
            send_stdio(json.loads(resp.read()))
        except Exception as e:
            if msg_id is not None:
                send_stdio({
                    "jsonrpc": "2.0", "id": msg_id,
                    "error": {"code": -32603, "message": f"Proxy error: {e}"},
                })


# ─── Main ───

if __name__ == "__main__":
    # Try to exclusively claim the WebSocket port — first process wins, others proxy.
    ws_server = try_bind_ws_server()

    if ws_server is None:
        # Port already taken → another relay is the server. Run as proxy.
        try:
            handle_stdio_proxy()
        except (KeyboardInterrupt, SystemExit):
            pass
        sys.exit(0)

    print(f"""
╔══════════════════════════════════════════╗
║       Browser MCP X Relay v{VERSION}            ║
║   Zero-dependency MCP bridge for Chrome   ║
╚══════════════════════════════════════════╝

  WebSocket: ws://127.0.0.1:{WS_PORT}  (for Chrome extension)
  HTTP status: http://127.0.0.1:{MCP_PORT}  (health check)
  stdio: MCP requests from AI agent

  1. Install the Browser MCP X Chrome extension
  2. Click the extension icon → Start
  3. Configure your AI agent to use this relay

  Press Ctrl+C to stop.
""", file=sys.stderr)

    threading.Thread(target=run_ws_server, args=(ws_server,), daemon=True).start()
    threading.Thread(target=start_http_status, daemon=True).start()

    try:
        handle_stdio()
    except (KeyboardInterrupt, SystemExit):
        print("\n[Browser MCP X] Shutting down.", file=sys.stderr)
        sys.exit(0)

    # stdin EOF — keep HTTP/WebSocket servers alive
    print("[Browser MCP X] stdio ended, keeping HTTP/WebSocket server alive...", file=sys.stderr)
    import signal
    if hasattr(signal, "pause"):
        signal.pause()
    else:
        while True:
            time.sleep(3600)