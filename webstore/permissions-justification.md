# BrowserMCP – Chrome Web Store Permission Justifications v0.4.0

Kopiere die passenden Texte in das Chrome Web Store Developer Dashboard.

## 1. activeTab
**Permission:** `activeTab`
**Justification:**
BrowserMCP performs browser automation only on the currently active tab when the user explicitly starts the relay or triggers a tool. This permission allows the extension to read the active tab’s URL and execute scripts on it during an active MCP session.

## 2. tabs
**Permission:** `tabs`
**Justification:**
Required to list open tabs, switch between tabs, create new tabs, close tabs, and read tab metadata (URL, title, active state) so AI agents can manage browser sessions through MCP tools.

## 3. scripting
**Permission:** `scripting`
**Justification:**
BrowserMCP injects minimal JavaScript into web pages to perform user-requested actions such as clicking, typing, scrolling, extracting text, and capturing the DOM. Injection happens only during active MCP sessions initiated by the user.

## 4. storage
**Permission:** `storage`
**Justification:**
Used to persist the user’s BrowserMCP Pro license key and basic settings locally. No personal browsing data is stored.

## 5. debugger
**Permission:** `debugger`
**Justification:**
BrowserMCP uses the debugger API as a fallback for screenshot capture when `captureVisibleTab` is unavailable or blocked. It is only attached to the active tab during an explicit screenshot tool call and detached immediately afterwards.

## 6. offscreen
**Permission:** `offscreen`
**Justification:**
Required to keep the MCP relay connection alive and run background tasks that cannot run in a service worker, such as maintaining the WebSocket bridge to the local relay.

## 7. windows
**Permission:** `windows`
**Justification:**
Used to bring the Chrome window to the foreground before taking a screenshot, because `chrome.tabs.captureVisibleTab` requires the browser window to be visible and focused.

## 8. host_permissions / `<all_urls>`
**Permission:** `host_permissions: ["<all_urls>"]`
**Justification:**
AI agents may navigate to arbitrary URLs on behalf of the user. BrowserMCP therefore needs permission to interact with any URL the user or agent visits. No data is collected or transmitted outside the local relay.

---

## Single-Purpose-Absatz (kopieren)

This extension exposes the user's Chrome browser as a Model Context Protocol (MCP) server so authorized AI agents can perform web automation tasks such as navigation, clicking, typing, scrolling, and screenshots. The sole purpose is browser control via MCP.

## Datennutzungserklärung (kopieren)

BrowserMCP does not collect, transmit, or sell user browsing data. All MCP communication happens through a local WebSocket relay running on the user's machine (`127.0.0.1:9274`). The only remote request is the optional LemonSqueezy license validation when a Pro license key is entered. No page content, URLs, or screenshots leave the user's device unless explicitly sent by the user or agent through their own MCP client.

## Remote Code

**Does your extension use remote code?** No.

## Affiliate/Data Usage

**Do you use user data for ads, affiliate marketing, or monetization beyond the Pro license?** No.
