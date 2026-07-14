#!/usr/bin/env python3
"""Stdio MCP server that bridges to the BrowserMCP Chrome extension HTTP relay."""
import json
import sys
import urllib.request
import urllib.error
from typing import Any

RELAY_URL = "http://127.0.0.1:9275/mcp"


def send_msg(msg: dict):
    print(json.dumps(msg), flush=True)


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
        payload["params"] = params
    data = json.dumps(payload).encode()
    req = urllib.request.Request(RELAY_URL, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60.0) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32000, "message": f"Cannot reach BrowserMCP relay at {RELAY_URL}: {e}"}}
    except Exception as e:
        return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32001, "message": str(e)}}


def handle_initialize(msg_id):
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "result": {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}, "logging": {}},
            "serverInfo": {"name": "browsermcp-mcp-server", "version": "0.4.0"},
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
