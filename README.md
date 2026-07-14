# BrowserMCP — AI Browser Control via MCP

> Turn Chrome into an MCP server. Let AI agents control your browser. Zero setup. 35 tools. No npm. No dependencies.

[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-success)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)
[![Tools: 35](https://img.shields.io/badge/MCP_Tools-35-blue)]()

## Why BrowserMCP?

| | BrowserMCP | mcp-chrome (12k★) | Playwright MCP |
|---|---|---|---|
| **Setup** | 1 click + `python3 relay.py` | `npm install -g` + extension | `npm install playwright` + browser |
| **Dependencies** | Python 3 (pre-installed) | Node.js + npm | Node.js + Playwright + browser binaries |
| **User session** | ✅ Uses your logged-in tabs | ✅ Uses your logged-in tabs | ❌ Clean browser, no logins |
| **Tools** | **35** (navigate, click, type, record, batch, forms, network, console, markdown, highlight, hover, drag-drop, dialogs, interactive elements, text-click...) | 20+ | ~10 |
| **Size** | ~50KB extension + 13KB relay | ~500KB extension + npm package | 300MB+ |
| **Recording/Playback** | ✅ Built-in | ❌ | ❌ |
| **Batch Execute** | ✅ Built-in | ❌ | ❌ |
| **Network Capture** | ✅ Built-in | ❌ | ❌ |
| **Markdown Export** | ✅ Built-in | ❌ | ❌ |

## Quick Start

### 1. Install Extension

1. Download this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `browser-mcp` folder

### 2. Start Relay

```bash
python3 relay.py
```

No pip install. No npm. No dependencies. Just Python 3.

### 3. Connect Your AI Agent

#### Cursor / Claude Desktop / any MCP client

Add to your MCP config:

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "python3",
      "args": ["path/to/relay.py"]
    }
  }
}
```

#### Hermes Agent

```bash
hermes mcp add browser-mcp --command "python3 /path/to/relay.py"
```

### 4. Start the Extension

Click the BrowserMCP extension icon → **Start**

## 35 MCP Tools

### Core Tools (Free)
| Tool | Description |
|---|---|
| `navigate` | Navigate to a URL |
| `screenshot` | Capture visible tab |
| `get_dom` | Extract simplified accessibility tree |
| `click` | Click element by CSS selector |
| `type_text` | Type text into a form field |
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
| `get_links` | Extract all links from the page |

### Advanced Tools (Free)
| Tool | Description |
|---|---|
| `start_recording` | Record browser actions |
| `stop_recording` | Stop recording & return JSON |
| `playback` | Replay recorded actions |
| `detect_forms` | Auto-detect all forms with fields |
| `auto_fill_form` | AI-fill a form with smart values |
| `create_tab` | Open a new tab with optional URL |
| `batch_execute` | Run multiple tool calls in sequence |
| `get_console_logs` | Capture console logs (errors, warnings) |
| `get_network_requests` | Capture network requests (URL, method, status) |

### Pro Tools
| Tool | Description |
|---|---|
| `highlight` | Visual element highlighting (red outline) |
| `wait_for_element` | Auto-wait for element to appear |
| `get_interactive_elements` | List all interactive elements with IDs |
| `click_by_id` | Click element by assigned ID |
| `type_by_id` | Type text into element by assigned ID |
| `click_text` | Click element by visible text |
| `hover` | Hover over an element |
| `drag_and_drop` | Drag element A onto element B |
| `handle_dialog` | Accept/dismiss alert/confirm/prompt dialogs |
| `get_markdown` | Export page content as structured Markdown |

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

## Privacy

- **100% local** — All processing happens on your machine
- **No telemetry** — No analytics, no tracking, no error reporting
- **No cloud** — Relay only listens on `127.0.0.1`
- **Your session** — Uses your logged-in browser tabs, not a clean browser

## License

MIT — Open Source

## Links

- **GitHub:** https://github.com/Tabtii/browser-mcp
- **MCP Protocol:** https://modelcontextprotocol.io
- **Report Issues:** https://github.com/Tabtii/browser-mcp/issues