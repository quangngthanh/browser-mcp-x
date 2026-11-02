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
import itertools
import os
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Force UTF-8 stdio. On Windows the default is the locale codepage
# (cp1252/cp1258/...), which corrupts multibyte input like Vietnamese
# text (e.g. "Tiếp tục") sent by the MCP client over stdin.
try:
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass  # Python < 3.7 has no TextIOWrapper.reconfigure

CP1252_MAP = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F
}

def fix_mojibake(s: str) -> str:
    if not isinstance(s, str) or not s:
        return s
    try:
        raw_bytes = bytearray()
        has_mojibake = False
        for ch in s:
            code = ord(ch)
            if code in CP1252_MAP:
                raw_bytes.append(CP1252_MAP[code])
                has_mojibake = True
            elif code <= 0xFF:
                raw_bytes.append(code)
                if code >= 0x80:
                    has_mojibake = True
            else:
                return s
        if not has_mojibake:
            return s
        return raw_bytes.decode("utf-8")
    except Exception:
        return s

def fix_args_mojibake(obj):
    if isinstance(obj, str):
        return fix_mojibake(obj)
    if isinstance(obj, dict):
        return {k: fix_args_mojibake(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [fix_args_mojibake(x) for x in obj]
    return obj

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
        self._send_lock = threading.Lock()

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
            with self._send_lock:
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
_internal_ids = itertools.count(1)
SESSION_HEADER = "X-BrowserMCPX-Session"
LOCAL_SESSION_ID = os.environ.get("BROWSER_MCP_X_SESSION") or uuid.uuid4().hex


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
                    else:
                        print(f"[Browser MCP X] Dropping late response {msg_id}", file=sys.stderr)
                    continue
                sys.stdout.write(json.dumps(parsed, ensure_ascii=False) + "\n")
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

TOOLS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools.json")


def load_tools_file():
    """tools.json next to relay.py is the shared source of truth with the extension."""
    try:
        with open(TOOLS_FILE, encoding="utf-8") as f:
            tools = json.load(f)
        return tools if isinstance(tools, list) and tools else None
    except Exception:
        return None


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


def call_extension_sync(msg: dict, timeout: float = 30.0, session_id: str = None) -> dict:
    """Forward an MCP request to the extension and wait for its JSON-RPC response.

    Each agent numbers its own requests from 1, so the client id is swapped for a
    relay-unique id on the wire and restored on the response.
    """
    client_id = msg.get("id")
    internal_id = f"bmx-{next(_internal_ids)}"

    def reply(resp: dict) -> dict:
        resp = dict(resp)
        resp["id"] = client_id
        return resp

    with extension_lock:
        client = extension_client if extension_client and extension_client.alive else None
    if not client:
        return reply({
            "jsonrpc": "2.0",
            "error": {"code": -32000, "message": "Browser extension not connected. Open Browser MCP X and click Start."}
        })

    out = dict(fix_args_mojibake(msg))
    out["id"] = internal_id
    out["sessionId"] = session_id or LOCAL_SESSION_ID
    response_queue = queue.Queue(maxsize=1)
    with pending_lock:
        pending_responses[internal_id] = response_queue
    try:
        if not client.send(json.dumps(out, ensure_ascii=False)):
            return reply({
                "jsonrpc": "2.0",
                "error": {"code": -32001, "message": "Failed to send request to Browser MCP X extension."}
            })
        try:
            return reply(response_queue.get(timeout=timeout))
        except queue.Empty:
            return reply({
                "jsonrpc": "2.0",
                "error": {"code": -32002, "message": f"Timeout waiting for Browser MCP X response after {timeout}s."}
            })
    finally:
        with pending_lock:
            pending_responses.pop(internal_id, None)


TOOLS_CACHE_PATH = os.path.join(os.path.expanduser("~"), ".browser-mcp-x", "tools.json")


def load_cached_tools():
    try:
        with open(TOOLS_CACHE_PATH, encoding="utf-8") as f:
            tools = json.load(f)
        return tools if isinstance(tools, list) and tools else None
    except Exception:
        return None


def save_cached_tools(tools: list):
    try:
        os.makedirs(os.path.dirname(TOOLS_CACHE_PATH), exist_ok=True)
        with open(TOOLS_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(tools, f, ensure_ascii=False)
    except Exception as e:
        print(f"[Browser MCP X] Could not cache tool list: {e}", file=sys.stderr)


def get_tools_list() -> list:
    """Live list from the extension; else tools.json; else the last list the extension reported."""
    if is_extension_connected() or wait_for_extension(5.0):
        resp = call_extension_sync({"jsonrpc": "2.0", "id": "tools-list", "method": "tools/list"}, timeout=10.0)
        tools = resp.get("result", {}).get("tools")
        if isinstance(tools, list) and tools:
            save_cached_tools(tools)
            return tools
    return load_tools_file() or load_cached_tools() or []


def send_stdio(msg: dict):
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def handle_stdio_message(msg: dict):
    """Handle one MCP JSON-RPC message without requiring extension for handshake."""
    method = msg.get("method")
    msg_id = msg.get("id")

    # Notifications have no id / no response
    if method == "notifications/initialized":
        print("[Browser MCP X] Client initialized", file=sys.stderr)
        return
    if msg_id is None:
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
        send_stdio({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": get_tools_list()}})
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
            "tools": [t["name"] for t in (load_tools_file() or load_cached_tools() or [])],
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
            msg = fix_args_mojibake(msg)
        except Exception as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Invalid JSON body: {e}"}
            }, ensure_ascii=False).encode("utf-8"))
            return

        session_id = self.headers.get(SESSION_HEADER) or "http-default"
        timeout = 55.0 if msg.get("method") == "tools/call" else 30.0
        if msg.get("method") == "tools/list":
            response = {"jsonrpc": "2.0", "id": msg.get("id"), "result": {"tools": get_tools_list()}}
        else:
            response = call_extension_sync(msg, timeout=timeout, session_id=session_id)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(response, ensure_ascii=False).encode("utf-8"))

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
    session_id = LOCAL_SESSION_ID

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            msg = fix_args_mojibake(msg)
        except Exception:
            continue

        method = msg.get("method")
        msg_id = msg.get("id")

        # Handle handshake locally — no round-trip needed
        if msg_id is None:
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
            body = json.dumps(msg, ensure_ascii=False).encode("utf-8")
            request = _req.Request(
                f"http://127.0.0.1:{MCP_PORT}/mcp",
                data=body,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    SESSION_HEADER: session_id,
                },
            )
            resp = _req.urlopen(request, timeout=65)
            send_stdio(json.loads(resp.read().decode("utf-8")))
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