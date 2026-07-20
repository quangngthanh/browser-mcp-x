# Design Spec: Browser MCP X Enhancements (Auto-connect, AI Tab Group & Auto-Scroll)

**Date:** 2026-07-21  
**Status:** Proposed / Under Review  
**Target Repo:** `browser-mcp-x`

---

## 1. Overview & Objectives

This design improves the user experience, reliability, and non-intrusiveness of **Browser MCP X**:
1. **Auto-Connect WebSocket**: Automatically connect the Chrome Extension to `relay.py` on startup (no manual "Start" button click required).
2. **Dedicated AI Tab Group ("🤖 AI Agent")**: Execute AI browser actions inside a dedicated Tab Group to prevent UI race conditions with the user's active window while retaining logged-in cookies and sessions.
3. **Auto ScrollIntoView & Smart Viewport**: Ensure target elements are brought into the viewport automatically before interaction, while labeling DOM/accessibility elements with viewport visibility metadata.

---

## 2. Detailed Architecture & Design

### A. Auto-Connect WebSocket Connection
* **Background Auto-Start**: Update `background.js` and `offscreen.js` so that `isRunning` defaults to `true` on extension load.
* **Reconnection Loop**: `offscreen.js` continually attempts connection to `ws://127.0.0.1:9274` on launch and whenever the connection drops (with exponential backoff between 2s and 10s).
* **Popup Sync**: `popup.html` and `popup.js` display the current connection status dynamically (Connected / Reconnecting) and provide a toggle to pause/disconnect if desired.

### B. Dedicated AI Tab Group Workspace
* **Manifest Permissions**: Add `"tabGroups"` permission to `manifest.json`.
* **Tab Group Management (`background.js`)**:
  * Maintain an internal state variable `aiTabId` and `aiGroupId`.
  * Helper function `getOrCreateAITab()`:
    1. Checks if `aiTabId` is valid and still exists.
    2. If invalid or missing, creates a new tab with `chrome.tabs.create({ active: false })`.
    3. Finds or creates a Chrome Tab Group named **`🤖 AI Agent`** (color: `purple`) using `chrome.tabGroups.group()` and `chrome.tabGroups.update()`.
    4. Adds the new tab into the `🤖 AI Agent` group.
  * **Targeting Logic**:
    * Core actions (`navigate`, `click`, `type_text`, `screenshot`, `get_dom`, `evaluate`, `snapshot`, etc.) execute against `getOrCreateAITab()` instead of assuming the user's currently focused `activeTab`.
    * explicit tab management tools (`get_tabs`, `switch_tab`, `close_tab`, `create_tab`) preserve full control for multi-tab workflows.

### C. Auto ScrollIntoView & Smart Viewport Metadata
* **Pre-action Auto-Scroll**:
  * In injection functions for `click`, `type_text`, `click_by_id`, `type_by_id`, `select_option`, and `hover`, call:
    ```javascript
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    ```
  * Wait briefly (100ms) after scroll before dispatching mouse/keyboard events.
* **Viewport Visibility Tagging**:
  * In `get_interactive_elements`, `get_dom`, and `snapshot`, calculate bounding rects relative to `window.innerHeight` and `window.innerWidth`.
  * Add `isInViewport: boolean` property to each extracted element node so AI agents are aware of on-screen vs. off-screen elements.

---

## 3. Component Impact Summary

| Component | File | Changes |
| :--- | :--- | :--- |
| **Manifest** | `manifest.json` | Add `"tabGroups"` to `permissions`. |
| **Background Service Worker** | `background.js` | Add `getOrCreateAITab()`, tab group creation/management, update tool execution context, add auto-scroll & `isInViewport` in injected functions. |
| **Offscreen Script** | `offscreen.js` | Default auto-connect on load, robust auto-reconnect retry loop. |
| **Popup UI** | `popup.js` / `popup.html` | Update status indicators to show "Auto-connecting" / "Connected". |

---

## 4. Risks & Mitigations

* **Risk**: Tab Group creation APIs might throw errors if user has single-tab window or tab dragging occurs.
  * *Mitigation*: Wrap `chrome.tabGroups` calls in `try...catch` and fallback to normal background tab creation if tab group creation fails.
* **Risk**: Smooth scrolling takes a few milliseconds, potential race condition for rapid actions.
  * *Mitigation*: Use instant scrolling `{ behavior: 'instant', block: 'center' }` for programmatic actions.
