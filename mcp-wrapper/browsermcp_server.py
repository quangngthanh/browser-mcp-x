#!/usr/bin/env python3
"""Stdio MCP server that bridges to the Browser MCP X Chrome extension HTTP relay."""
import json
import sys
import urllib.request
import urllib.error
from typing import Any

# Force UTF-8 stdio on all platforms (especially Windows where default code page causes mojibake)
try:
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

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

RELAY_URL = "http://127.0.0.1:9275/mcp"


def send_msg(msg: dict):
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def read_msgs():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def call_relay(method: str, params: dict | None = None, msg_id=None) -> dict:
    payload = {"jsonrpc": "2.0", "id": msg_id, "method": method}
    if params is not None:
        payload["params"] = fix_args_mojibake(params)
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(RELAY_URL, data=data, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60.0) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32000, "message": f"Cannot reach Browser MCP X relay at {RELAY_URL}: {e}"}}
    except Exception as e:
        return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32001, "message": str(e)}}


def handle_initialize(msg_id):
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}, "logging": {}},
            "serverInfo": {"name": "browser-mcp-x-server", "version": "0.4.1"},
        }
    }


def handle_tools_list(msg_id):
    # Fetch tool list from extension to stay in sync.
    resp = call_relay("tools/list", {}, msg_id)
    return resp


def handle_tools_call(msg_id, params: dict):
    return call_relay("tools/call", params, msg_id)


def main():
    for msg in read_msgs():
        msg_id = msg.get("id")
        method = msg.get("method")
        if method == "initialize":
            send_msg(handle_initialize(msg_id))
        elif method == "tools/list":
            send_msg(handle_tools_list(msg_id))
        elif method == "tools/call":
            send_msg(handle_tools_call(msg_id, msg.get("params", {})))
        elif method == "notifications/initialized":
            pass
        else:
            send_msg({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": f"Method not found: {method}"}})


if __name__ == "__main__":
    main()
