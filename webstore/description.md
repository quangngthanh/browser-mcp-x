# BrowserMCP — AI Browser Control via MCP

## Give AI agents control over your browser

BrowserMCP turns Chrome into an MCP server (Model Context Protocol). Connect AI agents like Claude, Cursor, or any MCP client directly to your browser — no npm, no bridge process, no dependencies.

### How it works

1. **Install extension** — Load unpacked in `chrome://extensions/`
2. **Start relay** — `python3 relay.py` (Python 3 is pre-installed on macOS/Linux)
3. **Connect AI agent** — Add MCP config, done
4. **Click Start** — BrowserMCP icon → Start

### 35 MCP Tools

**Core:** navigate, screenshot, get_dom, click, type_text, extract_text, scroll, get_tabs, switch_tab, close_tab, evaluate, get_page_info, fill_form, wait, press_key, get_links

**Advanced:** start_recording, stop_recording, playback, detect_forms, auto_fill_form, create_tab, batch_execute, get_console_logs, get_network_requests

**Pro:** highlight, wait_for_element, get_interactive_elements, click_by_id, type_by_id, click_text, hover, drag_and_drop, handle_dialog, get_markdown

### Why BrowserMCP?

- **Zero-Setup** — No npm, no Node.js, no pip. Just `python3 relay.py`
- **Your real session** — Uses your logged-in tabs, not a clean browser
- **100% local** — All processing on your machine. No telemetry, no analytics, no cloud
- **Minimal & fast** — ~50KB extension + 13KB relay. No 300MB+ browser binaries
- **Open standard** — Built on the Model Context Protocol (MCP)
- **Recording/Playback** — Record browser actions and replay them
- **Batch Execute** — Run multiple tool calls in a single request
- **Network Capture** — Monitor all network requests in real-time
- **Markdown Export** — Convert any page to clean structured Markdown

### Privacy

BrowserMCP transfers **no data to external servers**. The relay listens exclusively on `localhost`. All browser interaction happens locally via WebSocket on `127.0.0.1`. No telemetry, no tracking, no analytics.

### Requirements

- Google Chrome (or Chromium-based browser with Manifest V3 support)
- Python 3.x (pre-installed on macOS/Linux; Windows: small download)
- An MCP-capable AI client (Cursor, Claude Desktop, Hermes, etc.)

### Configuration

Add this to your MCP client config:

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

### Architecture

```
AI Agent (Claude / Cursor / Hermes)
    ↕ stdio (JSON-RPC)
relay.py (Python, zero deps)
    ↕ WebSocket (ws://127.0.0.1:9274)
Chrome Extension (offscreen document)
    ↕ chrome.scripting API
Browser Tab
```

### License

MIT — Open Source

---

**Links:**
- GitHub: https://github.com/Tabtii/browser-mcp
- MCP Protocol: https://modelcontextprotocol.io