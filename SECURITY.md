# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on this repository (private vulnerability reporting). Include steps to reproduce and the affected version.

You can expect an initial response within a few days.

## Scope and threat model

Browser MCP X intentionally lets an AI agent control your logged-in Chrome browser. Of interest:

- A web page or remote host reaching the relay (`127.0.0.1:9274` / `9275`) or driving the extension without the user's consent
- The relay listening on anything other than loopback
- Extension behavior that sends data to a server other than the MCP client you connected

Out of scope: actions an authorized, locally connected MCP client performs on purpose (clicking, reading cookies via `export_api_session`, etc.), and other local processes running as the same OS user.

## Supported versions

Only the latest release receives security fixes.
