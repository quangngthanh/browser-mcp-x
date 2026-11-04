# Privacy Policy

**Last updated: 2026-11-04**

## What Browser MCP X collects

**Nothing.** Browser MCP X does not collect, store, or transmit personal data to the developer or any third party.

## What Browser MCP X does

Browser MCP X is a local-only bridge between AI agents (Claude, Cursor, Hermes) and your Chrome browser.

- **Tool calls** (navigate, click, type, screenshot) are processed locally
- **The Python relay** binds to `127.0.0.1` only (WebSocket `9274`, HTTP `9275`) — not accessible from the internet or your local network
- **Screenshots, page text, cookies and network data** returned by tools are captured locally and sent only to the MCP client you connected. They are not stored by this project. What your AI client does with that data is governed by that client's and its provider's privacy policy.

## Third-party services

None. Browser MCP X makes no requests to external servers.
