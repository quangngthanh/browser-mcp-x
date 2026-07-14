# Privacy Policy

**Last updated: 2026-07-04**

## What BrowserMCP collects

**Nothing.** BrowserMCP does not collect, store, or transmit personal data.

## What BrowserMCP does

BrowserMCP is a local-only bridge between AI agents (Claude, Cursor, Hermes) and your Chrome browser.

- **Tool calls** (navigate, click, type, screenshot) are processed locally
- **The Python relay** binds to `127.0.0.1:9274` — not accessible from the internet
- **Screenshots** are captured locally and sent to the MCP client you connected — not stored

## License validation

If you purchase BrowserMCP Pro:

- Your license key is sent to `api.lemonsqueezy.com` (HTTPS) for validation
- The license key is stored in `chrome.storage.local` on your device
- No other data is sent to LemonSqueezy

## Third-party services

| Service | When | Data sent |
|---------|------|-----------|
| LemonSqueezy API | License validation (Pro only) | License key only |
| None else | — | — |

## Open source

BrowserMCP is open source (MIT). You can audit all code at [github.com/Tabtii/browser-mcp](https://github.com/Tabtii/browser-mcp).
