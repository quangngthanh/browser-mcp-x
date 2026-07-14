# Changelog

All notable changes to BrowserMCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-07-03

### Added
- **LemonSqueezy License API** — Pro-Tier license validation via LemonSqueezy `/v1/licenses/validate` and `/activate` (replaces insecure SHA-256 hash)
- **Pro Tier (€9)** — Lifetime license, 1 activation, deactivate for device transfer
- **Live checkout link** — LemonSqueezy checkout integrated into landing page
- **`windows` permission** — Focus Chrome window before screenshot for reliable capture
- **Privacy policy** — Added `docs/privacy.html` for GitHub Pages and Chrome Web Store
- **Chrome Web Store assets** — Promo tiles, screenshots, upload guide, permission justifications
- **`/license` debug endpoint** — Inspect license state via relay HTTP
- **stdio MCP wrapper** — `mcp-wrapper/browsermcp_server.py` bridges relay to Hermes MCP

### Changed
- LemonSqueezy license validation now sends JSON body (fixes HTTP 400)
- Wait for license load before Pro tool checks (restores Pro after extension reload)
- Removed unused `notifications` permission
- Landing page on GitHub Pages with pricing and Pro activation

### Fixed
- **Screenshot stability** — Hard 3s timeout + `captureVisibleTab` fallback for hidden/minimized Chrome windows
- **Cross-frame selectors** — `allFrames: true` + fallback selectors for `click`/`type`/`fill_form`
- **Unicode `click_text`** — NFD-normalized, diakritika removed, whitespace collapsed
- **Recording sync** — Service-worker queue + `RECORDING_ACTION` message merge for tool + content-script events
- **Relay timeout** — 30s timeout for `tools/call` prevents relay hang
- **MV3 popup CSP** — Safe content security policy, valid offscreen reason
- **WebSocket frames** — Unmasked server frames, `127.0.0.1` in CSP
- **Relay healthcheck** — Reports all 35 tools

## [0.3.0] — 2026-07-01

### Added
- **11 new tools** — `get_tabs`, `switch_tab`, `new_tab`, `close_tab`, `scroll`, `get_html`, `get_markdown`, `fill_form`, `get_links`, `get_images`, `wait`
- **Auto-reconnect** — Relay reconnects automatically after connection loss
- **Store assets** — Updated for 24 tools + privacy policy

## [0.2.0] — 2026-06-30

### Added
- **Recording/Playback** — `start_recording` / `stop_recording` with action merge (tool + content-script events)
- **Form detection** — `fill_form` with cross-frame support
- **Multi-tab workflows** — `switch_tab`, `new_tab`, `close_tab`

## [0.1.0] — 2026-06-29

### Added
- **Initial release** — Zero-setup MCP bridge for Chrome
- **24 tools** — `navigate`, `click`, `click_text`, `type_text`, `screenshot`, `get_text`, `get_element`, `get_markdown`, `back`, `forward`, `reload`, `get_url`, `get_title`, `scroll_to`, `evaluate`, `wait`, `start_recording`, `stop_recording`, `get_tabs`, `switch_tab`, `new_tab`, `close_tab`, `fill_form`, `get_links`
- **Python relay** — HTTP `/mcp` status + WebSocket `ws://127.0.0.1:9274` for JSON-RPC tool calls
- **Chrome MV3 extension** — Service worker + popup + offscreen for screenshot
- **Zero dependencies** — Python stdlib only, no npm required

[0.4.0]: https://github.com/Tabtii/browser-mcp/releases/tag/v0.4.0
[0.3.0]: https://github.com/Tabtii/browser-mcp/releases/tag/v0.3.0
[0.2.0]: https://github.com/Tabtii/browser-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/Tabtii/browser-mcp/releases/tag/v0.1.0
