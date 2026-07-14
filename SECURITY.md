# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in BrowserMCP, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email: torbi95@gmail.com
3. Include: description, steps to reproduce, potential impact

You will receive a response within 48 hours.

## Security considerations

### Extension permissions

BrowserMCP requests these Chrome permissions:

| Permission | Why |
|-----------|-----|
| `activeTab` | Access current tab for tool calls |
| `tabs` | List, switch, open, close tabs |
| `scripting` | Inject content scripts for element interaction |
| `storage` | Store license key and settings |
| `debugger` | Fallback screenshot method |
| `offscreen` | Offscreen document for screenshot processing |
| `windows` | Focus Chrome window before screenshot |

### Data flow

- **Tool calls** flow: MCP Client → Python Relay (localhost:9274) → Chrome Extension → Active Tab
- **No data leaves your machine** — the relay binds to `127.0.0.1` by default
- **License validation** contacts `api.lemonsqueezy.com` (HTTPS) — only license key is sent
- **No telemetry, no analytics, no tracking**

### License key storage

- Stored in `chrome.storage.local`
- Never logged to console
- Never sent to any endpoint except LemonSqueezy License API
