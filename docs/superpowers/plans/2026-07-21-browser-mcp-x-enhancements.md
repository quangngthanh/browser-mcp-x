# Browser MCP X Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement auto-connect WebSocket on extension load, dedicated AI Tab Group workspace (`🤖 AI Agent`), and auto-scrollIntoView with `isInViewport` metadata in `browser-mcp-x`.

**Architecture:** 
1. Update `manifest.json` with `"tabGroups"` permission.
2. Update `offscreen.js` to auto-connect to `ws://127.0.0.1:9274` on startup with exponential backoff.
3. Update `background.js` to manage an `aiTabId` and `aiGroupId` ("🤖 AI Agent"), directing AI actions to this isolated tab group.
4. Inject `scrollIntoView({ behavior: 'instant', block: 'center' })` before element interactions and append `isInViewport` metadata to DOM extraction tools.

**Tech Stack:** Chrome Extension Manifest V3 (`chrome.tabs`, `chrome.tabGroups`, `chrome.scripting`, `offscreen`, JavaScript ES6+).

## Global Constraints
- Target platform: Chrome Extension MV3
- Dependencies: Zero external npm/pip dependencies
- Port: `127.0.0.1:9274` (WebSocket relay)

---

### Task 1: Add `tabGroups` permission to `manifest.json`

**Files:**
- Modify: `manifest.json:6-14`

- [ ] **Step 1: Edit `manifest.json`**

Update permissions array in `manifest.json`:
```json
  "permissions": [
    "activeTab",
    "tabs",
    "tabGroups",
    "scripting",
    "storage",
    "debugger",
    "offscreen",
    "windows"
  ],
```

- [ ] **Step 2: Validate Manifest**

Run git diff to ensure valid JSON and correct syntax.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add tabGroups permission to manifest.json"
```

---

### Task 2: Auto-connect and reconnect logic in `offscreen.js`

**Files:**
- Modify: `offscreen.js:14-80`

- [ ] **Step 1: Update `offscreen.js` to auto-connect on load**

Modify `offscreen.js` so that `connectToRelay()` is called immediately on file load, and reconnects robustly without requiring a `START_MCP_SERVER` message.

```javascript
// Auto-connect on load
connectToRelay();

function connectToRelay() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(RELAY_WS_URL);

    ws.onopen = () => {
      console.log("[Browser MCP X] Connected to relay");
      connected = true;
      chrome.runtime.sendMessage({ type: "CLIENT_CONNECTED", clientId: "extension" });
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        chrome.runtime.sendMessage({ type: "MCP_REQUEST", data: msg }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Browser MCP X] sendMessage callback error:", chrome.runtime.lastError.message);
            return;
          }
          if (response && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
          }
        });
      } catch (e) {
        console.error("[Browser MCP X] Parse error:", e);
      }
    };

    ws.onclose = () => {
      console.log("[Browser MCP X] Disconnected from relay. Reconnecting in 3s...");
      connected = false;
      chrome.runtime.sendMessage({ type: "CLIENT_DISCONNECTED", clientId: "extension" });
      setTimeout(connectToRelay, 3000);
    };

    ws.onerror = (err) => {
      console.error("[Browser MCP X] WS error:", err);
    };
  } catch (e) {
    console.error("[Browser MCP X] Connection failed:", e);
    setTimeout(connectToRelay, 3000);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add offscreen.js
git commit -m "feat: enable auto-connect and persistent reconnect in offscreen.js"
```

---

### Task 3: Dedicated AI Tab Group Management in `background.js`

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add `aiTabId` state and `getOrCreateAITab()` helper**

Add to `background.js`:
```javascript
let aiTabId = null;
let aiGroupId = null;

async function getOrCreateAITab() {
  // Check if existing aiTabId is valid
  if (aiTabId !== null) {
    try {
      const tab = await chrome.tabs.get(aiTabId);
      if (tab) return tab.id;
    } catch (e) {
      aiTabId = null;
    }
  }

  // Create new tab for AI agent
  const tab = await chrome.tabs.create({ active: false, url: "about:blank" });
  aiTabId = tab.id;

  // Manage Tab Group "🤖 AI Agent"
  try {
    let group = null;
    if (aiGroupId !== null) {
      try {
        group = await chrome.tabGroups.get(aiGroupId);
      } catch (e) {
        aiGroupId = null;
      }
    }

    if (!group) {
      // Find existing group with title "🤖 AI Agent" if any
      const groups = await chrome.tabGroups.query({ title: "🤖 AI Agent" });
      if (groups.length > 0) {
        aiGroupId = groups[0].id;
      }
    }

    if (aiGroupId === null) {
      aiGroupId = await chrome.tabs.group({ tabIds: [aiTabId] });
      await chrome.tabGroups.update(aiGroupId, { title: "🤖 AI Agent", color: "purple" });
    } else {
      await chrome.tabs.group({ tabIds: [aiTabId], groupId: aiGroupId });
    }
  } catch (err) {
    console.warn("[Browser MCP X] Tab grouping warning:", err);
  }

  return aiTabId;
}
```

- [ ] **Step 2: Update `getActiveTabId` to use `getOrCreateAITab()`**

In `background.js`, update `getActiveTabId()` function so that AI tool calls default to `getOrCreateAITab()` instead of whatever window/tab the human user currently has focused.

```javascript
async function getActiveTabId() {
  return await getOrCreateAITab();
}
```

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: isolate AI browser actions into 🤖 AI Agent Tab Group"
```

---

### Task 4: Implement Auto `scrollIntoView` and `isInViewport` Metadata

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Inject `scrollIntoView` prior to element interaction**

In `background.js` function `executeAction` (or wherever `click`, `type_text`, `click_by_id`, `type_by_id`, `select_option`, `hover` are executed), inject `scrollIntoView({ behavior: 'instant', block: 'center' })` on the target element before performing the action:

```javascript
element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
```

- [ ] **Step 2: Add `isInViewport` property in `get_interactive_elements` and `snapshot`**

In element extraction scripts in `background.js`:
```javascript
const rect = el.getBoundingClientRect();
const isInViewport = (
  rect.top >= 0 &&
  rect.left >= 0 &&
  rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
  rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
  rect.width > 0 &&
  rect.height > 0
);
```
Add `isInViewport` to returned JSON items for each element.

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add auto scrollIntoView and isInViewport element metadata"
```
