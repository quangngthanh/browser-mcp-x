#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════
# BrowserMCP Relay — Zero-dependency MCP bridge
# Run: python3 relay.py
# Connects AI agents (Claude, Cursor, etc.) via stdio to
# the BrowserMCP Chrome extension via WebSocket.
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
import os
import queue
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

MCP_PORT = 9275
WS_PORT = 9274  # WebSocket port for extension connection
CDP_PORT = 9222  # Chrome remote debugging port
VERSION = "0.4.0"

# Last known URL of the agent-controlled tab (updated from navigate/get_page_info responses)
current_agent_url = None
current_agent_url_lock = threading.Lock()


def cdp_screenshot(url_hint=None, port=CDP_PORT, timeout=25.0):
    """Take a screenshot directly via Chrome remote debugging protocol.

    Requires Chrome to be launched with --remote-debugging-port=<port>.
    Returns base64-encoded PNG string.
    """
    import urllib.request as _req

    # 1. Discover debuggable page targets
    try:
        resp = _req.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5)
        targets = json.loads(resp.read())
    except Exception as e:
        raise ConnectionError(f"Chrome remote debugging unavailable on port {port}: {e}")

    pages = [t for t in targets
             if t.get("type") == "page"
             and not t.get("url", "").startswith("chrome")
             and not t.get("url", "").startswith("about:")]

    if not pages:
        raise ValueError("No debuggable page targets found in Chrome")

    # Prefer the tab whose URL matches the agent's last known URL
    target = pages[0]
    if url_hint:
        for t in pages:
            if t.get("url", "").rstrip("/") == url_hint.rstrip("/"):
                target = t
                break

    ws_url = target.get("webSocketDebuggerUrl")
    if not ws_url:
        raise ValueError(f"No WebSocket debugger URL for tab: {target.get('url')}")

    # 2. Connect as WebSocket CLIENT (frames must be masked, per RFC 6455)
    import urllib.parse
    parsed = urllib.parse.urlparse(ws_url)
    host = parsed.hostname
    port_num = parsed.port or 80
    path = parsed.path + (f"?{parsed.query}" if parsed.query else "")

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)
    try:
        sock.connect((host, port_num))

        # HTTP upgrade handshake
        ws_key = base64.b64encode(os.urandom(16)).decode()
        sock.sendall((
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port_num}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode())

        hs = b""
        while b"\r\n\r\n" not in hs:
            chunk = sock.recv(4096)
            if not chunk:
                raise ConnectionError("Connection closed during WebSocket handshake")
            hs += chunk
        if b"101" not in hs:
            raise ConnectionError("WebSocket upgrade rejected by Chrome")

        # 3. Send masked CDP command (client → server MUST be masked)
        def send_masked(text):
            payload = text.encode("utf-8")
            mask_key = os.urandom(4)
            masked = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))
            n = len(payload)
            hdr = b"\x81"
            if n < 126:
                hdr += bytes([0x80 | n])
            elif n < 65536:
                hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
            else:
                hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
            sock.sendall(hdr + mask_key + bytes(masked))

        send_masked(json.dumps({
            "id": 1,
            "method": "Page.captureScreenshot",
            "params": {"format": "png"}
        }))

        # 4. Read server frames (NOT masked) until we get the screenshot response
        buf = b""
        deadline = time.time() + timeout

        def read_bytes_cdp(n):
            nonlocal buf
            while len(buf) < n:
                remaining = deadline - time.time()
                if remaining <= 0:
                    raise TimeoutError("CDP screenshot timed out")
                sock.settimeout(min(remaining, 5.0))
                chunk = sock.recv(65536)
                if not chunk:
                    raise ConnectionError("CDP connection closed")
                buf += chunk
            data, buf = buf[:n], buf[n:]
            return data

        while True:
            hdr = read_bytes_cdp(2)
            opcode = hdr[0] & 0x0F
            is_masked = (hdr[1] & 0x80) != 0
            length = hdr[1] & 0x7F
            if length == 126:
                length = struct.unpack(">H", read_bytes_cdp(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", read_bytes_cdp(8))[0]
            mask_key = read_bytes_cdp(4) if is_masked else b""
            payload = bytearray(read_bytes_cdp(length))
            if is_masked:
                for i in range(len(payload)):
                    payload[i] ^= mask_key[i % 4]

            if opcode == 0x8:  # close
                raise ConnectionError("CDP WebSocket closed by Chrome")
            if opcode in (0x1, 0x0):  # text / continuation
                msg = json.loads(payload.decode("utf-8"))
                if msg.get("id") == 1:
                    if "result" in msg and "data" in msg["result"]:
                        return msg["result"]["data"]  # base64 PNG
                    if "error" in msg:
                        raise ValueError(f"CDP error: {msg['error']}")
            # skip ping/pong/events and read the next frame
    finally:
        try:
            sock.close()
        except Exception:
            pass

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

    def recv(self) -> str:
        try:
            header = self._read_bytes(2)
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

            if opcode == 0x8:  # close frame
                self.alive = False
                return ""

            return payload.decode("utf-8")
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
    print(f"[BrowserMCP] Extension connected from {addr}", file=sys.stderr)

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
        print(f"[BrowserMCP] Handshake error: {e}", file=sys.stderr)
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
                        # Track agent URL from navigate / get_page_info responses
                        _track_agent_url(parsed)
                        pending.put(parsed)
                        continue
                sys.stdout.write(json.dumps(parsed) + "\n")
                sys.stdout.flush()
            except Exception:
                pass

    print("[BrowserMCP] Extension disconnected", file=sys.stderr)
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
    print(f"[BrowserMCP] WebSocket server listening on port {WS_PORT}", file=sys.stderr)
    print(f"[BrowserMCP] Waiting for Chrome extension to connect...", file=sys.stderr)
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_extension_connection, args=(conn, addr), daemon=True).start()


# ─── stdio MCP handler ───

STATIC_TOOLS = [
    {"name": "navigate", "description": "Navigate to a URL", "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}},
    {"name": "screenshot", "description": "Capture visible tab", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_dom", "description": "Extract simplified accessibility tree", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "click", "description": "Click element by CSS selector", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}, "required": ["selector"]}},
    {"name": "type_text", "description": "Type text into a form field", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}, "text": {"type": "string"}}, "required": ["selector", "text"]}},
    {"name": "extract_text", "description": "Get text content from page/selector", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}}},
    {"name": "scroll", "description": "Scroll up/down", "inputSchema": {"type": "object", "properties": {"direction": {"type": "string"}, "amount": {"type": "number"}}}},
    {"name": "get_tabs", "description": "List all open tabs", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "switch_tab", "description": "Activate a specific tab", "inputSchema": {"type": "object", "properties": {"tabId": {"type": "number"}}, "required": ["tabId"]}},
    {"name": "close_tab", "description": "Close a tab", "inputSchema": {"type": "object", "properties": {"tabId": {"type": "number"}}, "required": ["tabId"]}},
    {"name": "create_tab", "description": "Open a new tab", "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}}},
    {"name": "evaluate", "description": "Run JavaScript in the page", "inputSchema": {"type": "object", "properties": {"script": {"type": "string"}}, "required": ["script"]}},
    {"name": "get_page_info", "description": "Get title, URL, viewport size", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "fill_form", "description": "Fill multiple form fields", "inputSchema": {"type": "object", "properties": {"fields": {"type": "object"}}, "required": ["fields"]}},
    {"name": "wait", "description": "Wait N milliseconds", "inputSchema": {"type": "object", "properties": {"ms": {"type": "number"}}, "required": ["ms"]}},
    {"name": "press_key", "description": "Simulate keyboard input", "inputSchema": {"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]}},
    {"name": "get_links", "description": "Extract all links from the page", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_markdown", "description": "Export page as Markdown", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_console_logs", "description": "Capture console logs", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_network_requests", "description": "Capture network requests", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_interactive_elements", "description": "List interactive elements", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "click_by_id", "description": "Click element by assigned ID", "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "type_by_id", "description": "Type into element by ID", "inputSchema": {"type": "object", "properties": {"id": {"type": "string"}, "text": {"type": "string"}}, "required": ["id", "text"]}},
    {"name": "click_text", "description": "Click by visible text", "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
    {"name": "hover", "description": "Hover over an element", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}, "required": ["selector"]}},
    {"name": "wait_for_element", "description": "Wait for element", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}, "required": ["selector"]}},
    {"name": "highlight", "description": "Highlight element", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}}, "required": ["selector"]}},
    {"name": "batch_execute", "description": "Run multiple tool calls", "inputSchema": {"type": "object", "properties": {"calls": {"type": "array"}}, "required": ["calls"]}},
    {"name": "snapshot", "description": "Capture ARIA accessibility tree of current page", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "select_option", "description": "Select option in a <select> dropdown by value, text, or index", "inputSchema": {"type": "object", "properties": {"selector": {"type": "string"}, "value": {"type": "string"}, "text": {"type": "string"}, "index": {"type": "number"}}, "required": ["selector"]}},
]


def _track_agent_url(response: dict):
    """Extract and store the current agent tab URL from tool responses."""
    global current_agent_url
    try:
        content = (response.get("result") or {}).get("content") or []
        for item in content:
            text = item.get("text", "")
            # navigate response: "Navigated to <url>"
            if text.startswith("Navigated to "):
                url = text[len("Navigated to "):]
                with current_agent_url_lock:
                    current_agent_url = url
                return
            # get_page_info response: JSON with "url" key
            try:
                data = json.loads(text)
                if isinstance(data, dict) and "url" in data:
                    with current_agent_url_lock:
                        current_agent_url = data["url"]
                    return
            except Exception:
                pass
    except Exception:
        pass


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
            "error": {"code": -32000, "message": "Browser extension not connected. Open BrowserMCP and click Start."}
        }

    response_queue = queue.Queue(maxsize=1)
    with pending_lock:
        pending_responses[msg_id] = response_queue
    try:
        if not client.send(json.dumps(msg)):
            return {
                "jsonrpc": "2.0", "id": msg_id,
                "error": {"code": -32001, "message": "Failed to send request to BrowserMCP extension."}
            }
        try:
            return response_queue.get(timeout=timeout)
        except queue.Empty:
            return {
                "jsonrpc": "2.0", "id": msg_id,
                "error": {"code": -32002, "message": f"Timeout waiting for BrowserMCP response after {timeout}s."}
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
        print("[BrowserMCP] Client initialized", file=sys.stderr)
        return

    if method == "initialize":
        # Answer locally so Cursor can connect even before Chrome extension is ready
        send_stdio({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "browser-mcp", "version": VERSION},
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
            print("[BrowserMCP] Waiting for Chrome extension...", file=sys.stderr)
            if not wait_for_extension(15.0):
                send_stdio({
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32000,
                        "message": "Browser extension not connected. Install BrowserMCP, open it, and click Start.",
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
    print("[BrowserMCP] Relay ready. Connect your MCP client via stdio.", file=sys.stderr)
    print(f"[BrowserMCP] WebSocket endpoint: ws://127.0.0.1:{WS_PORT}", file=sys.stderr)
    print(f"[BrowserMCP] HTTP status endpoint: http://127.0.0.1:{MCP_PORT}", file=sys.stderr)

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
            print(f"[BrowserMCP] Error handling message: {e}", file=sys.stderr)
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
            "name": "browser-mcp",
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
                "evaluate", "wait", "press_key", "get_console_logs",
                "get_network_requests", "handle_dialog",
                # Smart interaction
                "highlight", "wait_for_element", "get_interactive_elements",
                "click_by_id", "type_by_id", "click_text", "hover"
            ]
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(status, indent=2).encode())

    def do_POST(self):
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

        # Screenshot: try direct CDP first (bypasses extension + service worker)
        tool_name = (msg.get("params") or {}).get("name", "")
        if tool_name == "screenshot":
            try:
                with current_agent_url_lock:
                    url_hint = current_agent_url
                image_data = cdp_screenshot(url_hint=url_hint, timeout=25.0)
                response = {
                    "jsonrpc": "2.0",
                    "id": msg.get("id"),
                    "result": {
                        "content": [
                            {"type": "text", "text": "Screenshot captured"},
                            {"type": "image", "data": image_data, "mimeType": "image/png"}
                        ]
                    }
                }
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(response).encode())
                return
            except Exception:
                pass  # CDP unavailable — fall through to extension

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
    print(f"[BrowserMCP] Relay already running. Proxy mode → http://127.0.0.1:{MCP_PORT}/mcp", file=sys.stderr)

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
                    "serverInfo": {"name": "browser-mcp", "version": VERSION},
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
║       BrowserMCP Relay v{VERSION}            ║
║   Zero-dependency MCP bridge for Chrome   ║
╚══════════════════════════════════════════╝

  WebSocket: ws://127.0.0.1:{WS_PORT}  (for Chrome extension)
  HTTP status: http://127.0.0.1:{MCP_PORT}  (health check)
  stdio: MCP requests from AI agent

  1. Install the BrowserMCP Chrome extension
  2. Click the extension icon → Start
  3. Configure your AI agent to use this relay

  Press Ctrl+C to stop.
""", file=sys.stderr)

    threading.Thread(target=run_ws_server, args=(ws_server,), daemon=True).start()
    threading.Thread(target=start_http_status, daemon=True).start()

    try:
        handle_stdio()
    except (KeyboardInterrupt, SystemExit):
        print("\n[BrowserMCP] Shutting down.", file=sys.stderr)
        sys.exit(0)

    # stdin EOF — keep HTTP/WebSocket servers alive
    print("[BrowserMCP] stdio ended, keeping HTTP/WebSocket server alive...", file=sys.stderr)
    import signal
    if hasattr(signal, "pause"):
        signal.pause()
    else:
        while True:
            time.sleep(3600)