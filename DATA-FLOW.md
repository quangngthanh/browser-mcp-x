# Data Flow

## Architecture

```
MCP Client (Claude/Cursor/Hermes)
    ↕ JSON-RPC over stdio
MCP Wrapper (browsermcp_server.py)
    ↕ JSON-RPC over WebSocket (ws://127.0.0.1:9274)
Python Relay (relay.py)
    ↕ Chrome Extension API
Chrome Extension (background.js)
    ↕ Content Scripts
Active Browser Tab
```

## Tool call lifecycle

1. MCP client sends `tools/call` with tool name + params
2. MCP wrapper forwards to relay via WebSocket
3. Relay forwards to Chrome extension via WebSocket
4. Extension executes tool (e.g., `click`, `type_text`, `screenshot`)
5. Result returned: Extension → Relay → Wrapper → MCP Client

## What stays local

| Data | Where | Leaves machine? |
|------|-------|----------------|
| Tab content | Chrome → Relay → MCP Client | Only to your MCP client (localhost) |
| Screenshots | Chrome → Relay → MCP Client | Only to your MCP client (localhost) |
| License key | chrome.storage.local → LemonSqueezy API | Yes (HTTPS, key only) |
| Recording data | In-memory, service worker | No |

## Binding

- Relay binds to `127.0.0.1:9274` by default (localhost only)
- For LAN access, bind to `0.0.0.0:9274` (use `--host` flag)
- WebSocket requires the extension to be loaded and connected
