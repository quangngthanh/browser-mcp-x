# Contributing to BrowserMCP

Thanks for your interest in BrowserMCP! This is a small project, but contributions are welcome.

## Ways to contribute

- **Bug reports** — Open an issue with steps to reproduce
- **Feature requests** — Open an issue with a clear use case
- **Pull requests** — Fix a bug or add a tool

## Development setup

```bash
# Clone
git clone https://github.com/Tabtii/browser-mcp.git
cd browser-mcp

# Load extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the repo root directory

# Start the relay
python3 relay.py
```

## Adding a new tool

1. Add the tool handler in `background.js` (follow the existing `case` pattern)
2. Register the tool in the `tools/list` response in `relay.py`
3. Test with an MCP client (Claude Desktop, Cursor, Hermes)
4. Update `README.md` tool count and list

## Code style

- **JavaScript** — No build step, no transpiler. Plain ES modules in the service worker.
- **Python** — Stdlib only. No external dependencies. PEP 8-ish.
- **Commits** — Conventional commits preferred (`feat:`, `fix:`, `docs:`)

## Pull request checklist

- [ ] Tool works end-to-end with a real MCP client
- [ ] No new external dependencies
- [ ] README updated if tool count changed
- [ ] CHANGELOG.md updated

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
