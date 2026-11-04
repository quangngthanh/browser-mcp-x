# Browser MCP X — AI Browser Control via MCP

> Turn Chrome into an MCP server. Let AI agents control your browser. Zero setup. 37 tools. No npm. No dependencies.

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)
[![Tools: 37](https://img.shields.io/badge/MCP_Tools-37-blue)]()

## Why Browser MCP X?

| | Browser MCP X | mcp-chrome | Playwright MCP |
|---|---|---|---|
| **Setup** | 1 click + `python3 relay.py` | `npm install -g` + extension | `npm install playwright` + browser |
| **Dependencies** | Python 3 (pre-installed) | Node.js + npm | Node.js + Playwright + browser binaries |
| **User session** | ✅ Uses your logged-in tabs | ✅ Uses your logged-in tabs | ❌ Clean browser, no logins |
| **Tools** | **37** (navigate, click, type, snapshot, computer, file_upload, resize_window, select_option, batch, forms, network, console, markdown, hover, drag-drop, dialogs, interactive elements, text-click...) | 20+ | ~10 |
| **Size** | ~100KB extension + ~27KB relay | npm package + extension | 300MB+ |
| **Batch Execute** | ✅ Built-in | ❌ | ❌ |
| **Network Capture** | ✅ Built-in | ❌ | ❌ |
| **Markdown Export** | ✅ Built-in | ❌ | ❌ |

## Quick Start

### 1. Install Extension

1. Clone or download this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `browser-mcp-x` folder

### 2. Start Relay

```bash
python3 relay.py
```

No pip install. No npm. No dependencies. Just Python 3.7+.

### 3. Connect Your AI Agent

#### Cursor / Claude Desktop / any MCP client

Add to your MCP config:

```json
{
  "mcpServers": {
    "browser-mcp-x": {
      "command": "python3",
      "args": ["path/to/relay.py"]
    }
  }
}
```

#### Hermes Agent

```bash
hermes mcp add browser-mcp-x --command "python3 /path/to/relay.py"
```

### 4. Start the Extension

Click the Browser MCP X extension icon → **Start**

## 37 MCP Tools

### Core Tools
| Tool | Description |
|---|---|
| `navigate` | Navigate to a URL |
| `screenshot` | Capture visible tab |
| `snapshot` | Capture ARIA accessibility tree (roles, labels, states) |
| `click` | Click element by CSS selector |
| `type_text` | Type text into a form field |
| `select_option` | Select a `<select>` option by value, text, or index |
| `extract_text` | Get text content from page/selector |
| `scroll` | Scroll up/down |
| `get_tabs` | List all open tabs |
| `switch_tab` | Activate a specific tab |
| `close_tab` | Close a tab |
| `evaluate` | Run JavaScript in the page |
| `get_page_info` | Get title, URL, viewport size |
| `fill_form` | Fill multiple form fields at once |
| `wait` | Wait N milliseconds |
| `press_key` | Simulate keyboard input |

### Advanced Tools
| Tool | Description |
|---|---|
| `detect_forms` | Auto-detect all forms with fields |
| `create_tab` | Open a new tab with optional URL |
| `batch_execute` | Run multiple tool calls in sequence |
| `get_console_logs` | Capture console logs (errors, warnings) |
| `get_network_requests` | Capture network requests with full headers & payloads |
| `get_api_requests` | Capture API calls (XHR/Fetch) with Auth Tokens & Payloads |
| `get_curl_command` | Generate copy-pasteable cURL command for direct API execution |
| `export_api_session` | Export session cookies, auth headers & Python snippet for headless API calls |

### Interaction Tools
| Tool | Description |
|---|---|
| `wait_for_element` | Auto-wait for element to appear |
| `get_interactive_elements` | List all interactive elements with IDs |
| `click_by_id` | Click element by assigned ID |
| `type_by_id` | Type text into element by assigned ID |
| `click_text` | Click element by visible text |
| `hover` | Hover over an element |
| `drag_and_drop` | Drag element A onto element B |
| `handle_dialog` | Accept/dismiss alert/confirm/prompt dialogs |
| `get_markdown` | Export page content as structured Markdown |
| `download_image` | Download an image from the page |
| `file_upload` | Upload a file to `<input type="file">` via base64 |
| `resize_window` | Resize the browser window |
| `computer` | Coordinate-based click/scroll/type/key + screenshot after each action |

## Architecture

```
AI Agent (Claude / Cursor / Hermes)
    ↕ stdio (JSON-RPC)
relay.py (Python, zero deps)
    ↕ WebSocket (ws://127.0.0.1:9274)
Chrome Extension (offscreen document)
    ↕ chrome.scripting API
Browser Tab
```

Tool definitions live in a single file, `tools.json`, read by both the extension (`tools/list`) and `relay.py` (fallback while the extension is not connected). To add or change a tool, edit `tools.json` and add its handler in `background.js`.

## Security

Browser MCP X gives an AI agent **full control of your logged-in browser**. Treat it like handing over your keyboard and mouse.

- Only connect AI agents and MCP clients you trust, and use it only with accounts and sites you own or are authorized to automate.
- `evaluate`, `get_api_requests`, `get_curl_command` and `export_api_session` can read page data, cookies and auth tokens. Anything the agent sees is sent to your AI provider.
- The relay binds to `127.0.0.1` only. HTTP requests carrying a browser `Origin` header or a non-loopback `Host` are rejected, and the WebSocket accepts only `chrome-extension://` origins, so web pages cannot talk to it. Any other local process running as you still can.
- Extension permissions (`<all_urls>`, `debugger`, `cookies`, `webRequest`, `scripting`, `tabs`, `tabGroups`, `windows`) exist solely to implement the tools above. Nothing is collected or sent anywhere. See [PRIVACY.md](PRIVACY.md).

Found a vulnerability? Please report it privately — see [SECURITY.md](SECURITY.md).

## Privacy

- **100% local** — All processing happens on your machine
- **No telemetry** — No analytics, no tracking, no error reporting
- **No cloud** — Relay only listens on `127.0.0.1`
- **Your session** — Uses your logged-in browser tabs, not a clean browser

## License

MIT — Open Source

Forked from [Tabtii/browser-mcp](https://github.com/Tabtii/browser-mcp), with additional stability fixes and tooling changes.

## Links

- **MCP Protocol:** https://modelcontextprotocol.io