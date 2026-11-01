// ═══════════════════════════════════════════════════════════
// Browser MCP X — Background Service Worker
// Zero-setup MCP server running inside the extension
// AI agents connect via WebSocket to localhost:9275
// ═══════════════════════════════════════════════════════════

const MCP_PORT = 9275;
const MCP_VERSION = "0.4.1";
let wsServer = null;
let wsClients = new Set();
let isRunning = false;
let connectedAgent = null;

/** Stable refs from the last get_interactive_elements call (per tab). */
const interactiveElementCache = new Map();

const INTERACTIVE_SELECTORS = {
  all: "button, a[href], input, select, textarea, [contenteditable='true'], [role='button'], [role='textbox'], [onclick], [tabindex]",
  buttons: "button, [role='button'], input[type='submit'], input[type='button'], [onclick]",
  links: "a[href]",
  inputs: "input, select, textarea, [contenteditable='true'], [role='textbox']",
  forms: "form"
};

// ─── MCP Tool Definitions ───
const MCP_TOOLS = [
  {
    name: "navigate",
    description: "Navigate the active tab to a URL",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the active tab",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_dom",
    description: "Extract the DOM structure of the active tab as text (simplified accessibility tree)",
    inputSchema: { type: "object", properties: { selector: { type: "string", default: "body" } } }
  },
  {
    name: "click",
    description: "Click an element by CSS selector",
    inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] }
  },
  {
    name: "type_text",
    description: "Type text into an input, textarea, or contenteditable / rich-text editor. Uses native setters + insertText so React-controlled fields update.",
    inputSchema: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"] }
  },
  {
    name: "extract_text",
    description: "Extract text content from the active tab, optionally from a specific selector",
    inputSchema: { type: "object", properties: { selector: { type: "string", default: "body" } } }
  },
  {
    name: "scroll",
    description: "Scroll the page or a specific element (e.g. a dialog overlay) by a given amount",
    inputSchema: { type: "object", properties: { direction: { type: "string", enum: ["up", "down"], default: "down" }, amount: { type: "number", default: 500 }, selector: { type: "string", description: "CSS selector of the scrollable container; omit to scroll the page" } } }
  },
  {
    name: "get_tabs",
    description: "List all open tabs with their IDs, titles, and URLs",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "switch_tab",
    description: "Switch to a specific tab by its ID",
    inputSchema: { type: "object", properties: { tabId: { type: "number" } }, required: ["tabId"] }
  },
  {
    name: "close_tab",
    description: "Close a tab by its ID",
    inputSchema: { type: "object", properties: { tabId: { type: "number" } }, required: ["tabId"] }
  },
  {
    name: "evaluate",
    description: "Run JavaScript in the active tab. Awaits Promises. Objects are JSON-serialized.",
    inputSchema: { type: "object", properties: { script: { type: "string" } }, required: ["script"] }
  },
  {
    name: "get_page_info",
    description: "Get metadata about the current page (title, URL, viewport size)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "fill_form",
    description: "Fill multiple form fields at once. Pass an object of {selector: value} pairs.",
    inputSchema: { type: "object", properties: { fields: { type: "object" } }, required: ["fields"] }
  },
  {
    name: "wait",
    description: "Wait for a specified number of milliseconds",
    inputSchema: { type: "object", properties: { ms: { type: "number", default: 1000 } } }
  },
  {
    name: "press_key",
    description: "Press a key on the focused element. Supports combos like 'Enter', 'Escape', 'Control+a', 'Ctrl+Enter'.",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] }
  },
  {
    name: "download_image",
    description: "Download a page image to the user's Downloads folder via canvas capture (avoids CORS). Prefer over fetch(img.src).",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for <img>. If omitted or not found, downloads the largest image on the page." },
        filename: { type: "string", description: "Filename, e.g. image.png" }
      }
    }
  },
  {
    name: "get_links",
    description: "Extract all links from the page with their text and href",
    inputSchema: { type: "object", properties: {} }
  },
  // ─── Recording / Playback ───
  {
    name: "start_recording",
    description: "Start recording browser actions (clicks, inputs, navigations) for later playback",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "stop_recording",
    description: "Stop recording and return the recorded action sequence as JSON",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "playback",
    description: "Replay a previously recorded action sequence. Pass the actions array from stop_recording.",
    inputSchema: { type: "object", properties: { actions: { type: "array" }, speed: { type: "number", default: 1 } }, required: ["actions"] }
  },
  // ─── Form Detection ───
  {
    name: "detect_forms",
    description: "Auto-detect all forms on the page with their fields, types, labels, and selectors",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "auto_fill_form",
    description: "Auto-fill a form with AI-generated values. Detects the form and suggests values based on field types/names.",
    inputSchema: { type: "object", properties: { selector: { type: "string", default: "form" }, values: { type: "object" } } }
  },
  // ─── Multi-Tab Workflows ───
  {
    name: "create_tab",
    description: "Create a new tab with an optional URL. Opens in the background by default so it doesn't steal focus from the user; pass active=true to foreground it. Pass newWindow=true to open it in a separate Chrome window (same profile/session) instead of the current window.",
    inputSchema: { type: "object", properties: { url: { type: "string" }, active: { type: "boolean", default: false }, newWindow: { type: "boolean", default: false } } }
  },
  {
    name: "batch_execute",
    description: "Execute multiple tool calls in sequence on a specific tab. Pass an array of {tool, args} objects.",
    inputSchema: { type: "object", properties: { tabId: { type: "number" }, steps: { type: "array" } }, required: ["steps"] }
  },
  {
    name: "get_console_logs",
    description: "Capture console logs from the active tab (errors, warnings, logs)",
    inputSchema: { type: "object", properties: { level: { type: "string", enum: ["error", "warn", "log", "all"], default: "all" } } }
  },
  {
    name: "get_network_requests",
    description: "Capture recent network requests from the active tab (URL, method, status, type, headers, payload)",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", default: "" },
        type: { type: "string", enum: ["all", "xmlhttprequest", "fetch", "script", "main_frame", "sub_frame"], default: "all" },
        limit: { type: "number", default: 50 },
        includeHeaders: { type: "boolean", default: true }
      }
    }
  },
  {
    name: "get_api_requests",
    description: "Capture API calls (XHR/Fetch) with full HTTP headers, Auth Tokens, parameters, and request body payloads for direct API re-play.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", default: "" },
        limit: { type: "number", default: 20 }
      }
    }
  },
  {
    name: "get_curl_command",
    description: "Generate a copy-pasteable cURL command for a captured network request (including auth headers and payload) to execute directly without UI.",
    inputSchema: {
      type: "object",
      properties: {
        urlPattern: { type: "string" },
        requestIndex: { type: "number", default: 0 }
      },
      required: ["urlPattern"]
    }
  },
  {
    name: "export_api_session",
    description: "Export authentication cookies, bearer tokens, and headers for a domain. Returns JSON + ready-to-run Python requests script to call APIs headlessly.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", default: "" }
      }
    }
  },
  // ─── Phase 1: Quick Wins ───
  {
    name: "highlight",
    description: "Visually highlight an element with a colored border. Pass a CSS selector. Pass duration=0 to remove all highlights.",
    inputSchema: { type: "object", properties: { selector: { type: "string" }, color: { type: "string", default: "#E55934" }, duration: { type: "number", default: 3000 } }, required: ["selector"] }
  },
  {
    name: "wait_for_element",
    description: "Wait until an element matching the CSS selector appears on the page. Auto-resolves when found or after timeout.",
    inputSchema: { type: "object", properties: { selector: { type: "string" }, timeout: { type: "number", default: 10000 }, visible: { type: "boolean", default: true } }, required: ["selector"] }
  },
  {
    name: "get_interactive_elements",
    description: "List all interactive elements (buttons, links, inputs, selects) with numeric IDs. Use the returned ID with click_by_id or type_by_id.",
    inputSchema: { type: "object", properties: { filter: { type: "string", enum: ["all", "buttons", "links", "inputs", "forms"], default: "all" } } }
  },
  {
    name: "click_by_id",
    description: "Click an element by its interactive ID (from get_interactive_elements). Much easier than CSS selectors.",
    inputSchema: { type: "object", properties: { elementId: { type: "number" } }, required: ["elementId"] }
  },
  {
    name: "type_by_id",
    description: "Type text into the element with the given interactive ID (from get_interactive_elements).",
    inputSchema: { type: "object", properties: { elementId: { type: "number" }, text: { type: "string" } }, required: ["elementId", "text"] }
  },
  {
    name: "click_text",
    description: "Click an element by its visible text content. e.g. click_text({text: 'Submit'}). Searches buttons, links, and all visible elements.",
    inputSchema: { type: "object", properties: { text: { type: "string" }, partial: { type: "boolean", default: true } }, required: ["text"] }
  },
  {
    name: "hover",
    description: "Hover over an element by CSS selector. Triggers mouseenter/mouseover events.",
    inputSchema: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] }
  },
  {
    name: "drag_and_drop",
    description: "Drag an element from a source selector to a target selector. Uses HTML5 drag events.",
    inputSchema: { type: "object", properties: { source: { type: "string" }, target: { type: "string" } }, required: ["source", "target"] }
  },
  {
    name: "handle_dialog",
    description: "Accept or dismiss a JavaScript dialog (alert, confirm, prompt). Also can type text into a prompt.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["accept", "dismiss"], default: "accept" }, text: { type: "string" } } }
  },
  {
    name: "get_markdown",
    description: "Convert the current page content to structured Markdown. Headings, lists, tables, links, and code blocks are preserved semantically.",
    inputSchema: { type: "object", properties: { selector: { type: "string", default: "body" }, max_length: { type: "number", default: 10000 } } }
  },
  {
    name: "snapshot",
    description: "Capture the ARIA accessibility tree of the current page. Returns semantic roles, labels, and states (checked, disabled, expanded, value...). Use this to understand page structure before acting, or to verify what changed after an action.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "select_option",
    description: "Select an option in a <select> dropdown by value, visible text, or index. Returns confirmation and updated page snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        value: { type: "string" },
        text: { type: "string" },
        index: { type: "number" }
      },
      required: ["selector"]
    }
  },
  // ─── New tools ───
  {
    name: "file_upload",
    description: "Upload a file to an <input type=\"file\"> element. Provide the file content as base64 and the filename.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector for the file input element" },
        filename: { type: "string", description: "Filename (e.g. 'document.pdf')" },
        mimeType: { type: "string", description: "MIME type (e.g. 'image/jpeg')", default: "application/octet-stream" },
        base64Data: { type: "string", description: "Base64-encoded file content" }
      },
      required: ["selector", "filename", "base64Data"]
    }
  },
  {
    name: "resize_window",
    description: "Resize the current browser window to specified dimensions",
    inputSchema: {
      type: "object",
      properties: {
        width: { type: "number", description: "Window width in pixels" },
        height: { type: "number", description: "Window height in pixels" },
        left: { type: "number", description: "Window left position in pixels" },
        top: { type: "number", description: "Window top position in pixels" }
      }
    }
  },
  {
    name: "computer",
    description: "Computer-use style interaction: screenshot, coordinate-based click/scroll, type text, or press keys. Returns a screenshot after each action for visual confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["left_click", "right_click", "middle_click", "double_click", "mouse_move", "type", "key", "scroll"],
          description: "Action to perform"
        },
        x: { type: "number", description: "X coordinate in pixels (for click/move/scroll actions)" },
        y: { type: "number", description: "Y coordinate in pixels (for click/move/scroll actions)" },
        text: { type: "string", description: "Text to type (for 'type' action)" },
        key: { type: "string", description: "Key combo to press, e.g. 'Enter', 'Control+a' (for 'key' action)" },
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction (for 'scroll' action)", default: "down" },
        amount: { type: "number", description: "Scroll amount in pixels (for 'scroll' action)", default: 300 }
      },
      required: ["action"]
    }
  }
];

// ─── Agent Tab Lock ───
// Each agent session (one relay/proxy process) owns its own tab inside the
// "BrowserMCPX" group so concurrent agents never drive the same page.
// Persisted to chrome.storage.local to survive reconnects and service-worker restarts.
const DEFAULT_SESSION_ID = "default";
const SESSION_CLAIM_TTL_MS = 10 * 60 * 1000;
const IDLE_TAB_TTL_MS = 24 * 60 * 60 * 1000;
const AGENT_LOCK_TIMEOUT_MS = 15000;
const IDLE_SWEEP_ALARM = "browsermcpx-idle-tab-sweep";
let sessionTabs = new Map();
let tabLastUsed = new Map();
let activeManipulatedTabIds = new Set();
let aiGroupId = null;
let agentTabQueue = Promise.resolve();
let agentContextRestored = false;

function persistAgentContext() {
  chrome.storage.local.set({
    sessionTabs: Object.fromEntries(sessionTabs),
    tabLastUsed: Object.fromEntries(tabLastUsed),
    activeManipulatedTabIds: Array.from(activeManipulatedTabIds),
    aiGroupId
  });
}

function withAgentLock(fn) {
  const run = agentTabQueue.then(() => withTimeout(fn(), AGENT_LOCK_TIMEOUT_MS, "Agent tab lock"));
  agentTabQueue = run.catch(() => {});
  return run;
}

function restoreAgentContext() {
  return withAgentLock(loadAgentContext);
}

async function ensureAgentContext() {
  if (!agentContextRestored) await loadAgentContext();
}

async function tabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (e) {
    return false;
  }
}

async function loadAgentContext() {
  agentContextRestored = true;
  const stored = await chrome.storage.local.get(["sessionTabs", "tabLastUsed", "activeManipulatedTabIds", "aiGroupId"]);
  const now = Date.now();
  if (stored.tabLastUsed && typeof stored.tabLastUsed === "object") {
    for (const [id, ts] of Object.entries(stored.tabLastUsed)) {
      const tabId = Number(id);
      if (!tabLastUsed.has(tabId) && await tabExists(tabId)) tabLastUsed.set(tabId, ts);
    }
  }
  if (stored.sessionTabs && typeof stored.sessionTabs === "object") {
    for (const [sessionId, entry] of Object.entries(stored.sessionTabs)) {
      if (sessionTabs.has(sessionId) || !entry || entry.tabId == null) continue;
      if (now - (entry.lastUsed || 0) > IDLE_TAB_TTL_MS) continue;
      const owned = [];
      for (const id of [entry.tabId, ...(entry.ownedTabIds || [])]) {
        if (!owned.includes(id) && await tabExists(id)) owned.push(id);
      }
      if (owned.includes(entry.tabId)) {
        sessionTabs.set(sessionId, { tabId: entry.tabId, ownedTabIds: owned, lastUsed: entry.lastUsed });
      }
    }
  }
  if (stored.aiGroupId != null && aiGroupId === null) {
    try {
      await chrome.tabGroups.get(stored.aiGroupId);
      aiGroupId = stored.aiGroupId;
    } catch (e) {
      aiGroupId = null;
    }
  }
  if (Array.isArray(stored.activeManipulatedTabIds)) {
    for (const id of stored.activeManipulatedTabIds) {
      if (await tabExists(id)) activeManipulatedTabIds.add(id);
    }
  }
  persistAgentContext();
}

function isClaimActive(entry) {
  return Date.now() - entry.lastUsed < SESSION_CLAIM_TTL_MS;
}

function releaseTab(tabId, exceptSessionId) {
  for (const [sid, entry] of sessionTabs) {
    if (sid === exceptSessionId) continue;
    entry.ownedTabIds = entry.ownedTabIds.filter(id => id !== tabId);
    if (entry.tabId === tabId || entry.ownedTabIds.length === 0) sessionTabs.delete(sid);
  }
}

function claimTab(sessionId, tabId, { makeCurrent = true } = {}) {
  releaseTab(tabId, sessionId);
  const entry = sessionTabs.get(sessionId) || { tabId, ownedTabIds: [] };
  if (makeCurrent) entry.tabId = tabId;
  if (!entry.ownedTabIds.includes(tabId)) entry.ownedTabIds.push(tabId);
  entry.lastUsed = Date.now();
  sessionTabs.set(sessionId, entry);
  tabLastUsed.set(tabId, entry.lastUsed);
  persistAgentContext();
}

function touchSession(sessionId, tabId) {
  const now = Date.now();
  tabLastUsed.set(tabId, now);
  const entry = sessionTabs.get(sessionId);
  if (entry && entry.ownedTabIds.includes(tabId)) entry.lastUsed = now;
  persistAgentContext();
}

function tabOwner(tabId, exceptSessionId) {
  for (const [sid, entry] of sessionTabs) {
    if (sid !== exceptSessionId && entry.ownedTabIds.includes(tabId) && isClaimActive(entry)) return sid;
  }
  return null;
}

async function resolveAgentGroup() {
  if (aiGroupId !== null) {
    try {
      await chrome.tabGroups.get(aiGroupId);
      return;
    } catch (e) {
      aiGroupId = null;
    }
  }
  try {
    const groups = await chrome.tabGroups.query({ title: "BrowserMCPX" });
    if (groups.length > 0) aiGroupId = groups[0].id;
  } catch (e) {
    aiGroupId = null;
  }
}

async function addTabToAgentGroup(tabId) {
  await resolveAgentGroup();
  if (aiGroupId !== null) {
    try {
      await chrome.tabs.group({ tabIds: [tabId], groupId: aiGroupId });
      return;
    } catch (e) { /* stale group, create a new one */ }
  }
  aiGroupId = await chrome.tabs.group({ tabIds: [tabId] });
  await chrome.tabGroups.update(aiGroupId, { title: "BrowserMCPX", color: "purple" });
}

async function queryAgentGroupTabs() {
  await resolveAgentGroup();
  if (aiGroupId === null) return [];
  try {
    return await chrome.tabs.query({ groupId: aiGroupId });
  } catch (e) {
    return [];
  }
}

function getAgentTab(sessionId = DEFAULT_SESSION_ID) {
  return withAgentLock(() => resolveAgentTab(sessionId));
}

async function resolveAgentTab(sessionId) {
  await ensureAgentContext();
  const groupTabs = await queryAgentGroupTabs();

  const own = sessionTabs.get(sessionId);
  if (own) {
    const ownTab = groupTabs.find(t => t.id === own.tabId);
    if (ownTab) {
      claimTab(sessionId, ownTab.id);
      return ownTab;
    }
    sessionTabs.delete(sessionId);
  }

  const free = groupTabs.filter(t => !tabOwner(t.id, sessionId));
  const picked = free.find(t => t.active) || free[0];
  if (picked) {
    claimTab(sessionId, picked.id);
    return picked;
  }

  const newTab = await chrome.tabs.create({ active: false, url: "about:blank" });
  try {
    await addTabToAgentGroup(newTab.id);
  } catch (err) {
    console.error("[Browser MCP X] Failed to group AI tab:", err);
  }
  claimTab(sessionId, newTab.id);
  return newTab;
}

function switchSessionTab(sessionId, tabId) {
  return withAgentLock(async () => {
    await ensureAgentContext();
    const groupTabs = await queryAgentGroupTabs();
    if (!groupTabs.some(t => t.id === tabId)) {
      throw new Error(`Tab ${tabId} is not in the BrowserMCPX group`);
    }
    if (tabOwner(tabId, sessionId)) {
      throw new Error(`Tab ${tabId} is in use by another agent session`);
    }
    claimTab(sessionId, tabId);
  });
}

function registerCreatedTab(sessionId, tabId, grouped) {
  return withAgentLock(async () => {
    await ensureAgentContext();
    if (grouped) await addTabToAgentGroup(tabId);
    claimTab(sessionId, tabId, { makeCurrent: !sessionTabs.has(sessionId) });
  });
}

function closeIdleAgentTabs() {
  return withAgentLock(async () => {
    await ensureAgentContext();
    const now = Date.now();
    const idle = [];
    for (const tab of await queryAgentGroupTabs()) {
      if (!tabLastUsed.has(tab.id)) {
        tabLastUsed.set(tab.id, now);
      } else if (now - tabLastUsed.get(tab.id) > IDLE_TAB_TTL_MS) {
        idle.push(tab.id);
      }
    }
    if (idle.length > 0) {
      await chrome.tabs.remove(idle).catch(() => {});
      for (const id of idle) {
        releaseTab(id, null);
        tabLastUsed.delete(id);
      }
    }
    persistAgentContext();
    return idle;
  });
}

chrome.alarms.create(IDLE_SWEEP_ALARM, { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === IDLE_SWEEP_ALARM) closeIdleAgentTabs().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  releaseTab(tabId, null);
  tabLastUsed.delete(tabId);
  interactiveElementCache.delete(tabId);
  persistAgentContext();
});

// ─── Recording State ───
let recordingState = { isRecording: false, actions: [], recordingTabId: null };

// ─── Network/Console Capture State ───
let consoleLogs = [];
let networkRequests = [];
const CAPTURED_REQUESTS_MAX = 200;
let capturedRequests = [];
const pendingRequestsMap = new Map();

if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
  try {
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.tabId >= 0) {
          let bodyStr = null;
          if (details.requestBody) {
            if (details.requestBody.formData) {
              bodyStr = JSON.stringify(details.requestBody.formData);
            } else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
              try {
                const dec = new TextDecoder("utf-8");
                bodyStr = details.requestBody.raw.map(b => b.bytes ? dec.decode(b.bytes) : "").join("");
              } catch (e) {}
            }
          }
          pendingRequestsMap.set(details.requestId, {
            id: details.requestId,
            url: details.url,
            method: details.method,
            type: details.type,
            tabId: details.tabId,
            timestamp: new Date(details.timeStamp).toISOString(),
            requestBody: bodyStr,
            headers: {},
            responseHeaders: {},
            statusCode: null
          });
        }
      },
      { urls: ["<all_urls>"] },
      ["requestBody"]
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        const req = pendingRequestsMap.get(details.requestId);
        if (req && details.requestHeaders) {
          const headersObj = {};
          for (const h of details.requestHeaders) {
            headersObj[h.name] = h.value;
          }
          req.headers = headersObj;
        }
      },
      { urls: ["<all_urls>"] },
      ["requestHeaders", "extraHeaders"]
    );

    chrome.webRequest.onCompleted.addListener(
      (details) => {
        const req = pendingRequestsMap.get(details.requestId);
        if (req) {
          req.statusCode = details.statusCode || 200;
          if (details.responseHeaders) {
            const respHeadersObj = {};
            for (const h of details.responseHeaders) {
              respHeadersObj[h.name] = h.value;
            }
            req.responseHeaders = respHeadersObj;
          }
          pendingRequestsMap.delete(details.requestId);

          capturedRequests.push(req);
          if (capturedRequests.length > CAPTURED_REQUESTS_MAX) {
            capturedRequests.shift();
          }
        }
      },
      { urls: ["<all_urls>"] },
      ["responseHeaders", "extraHeaders"]
    );

    chrome.webRequest.onErrorOccurred.addListener(
      (details) => {
        const req = pendingRequestsMap.get(details.requestId);
        if (req) {
          req.statusCode = 0;
          pendingRequestsMap.delete(details.requestId);
          capturedRequests.push(req);
          if (capturedRequests.length > CAPTURED_REQUESTS_MAX) {
            capturedRequests.shift();
          }
        }
      },
      { urls: ["<all_urls>"] }
    );
  } catch (err) {
    console.warn("[Browser MCP X] webRequest initialization warning:", err);
  }
}

// ─── Mojibake Recovery & Unicode Helpers ───
const CP1252_MAP = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F
};

function fixMojibake(s) {
  if (typeof s !== "string" || !s) return s;
  try {
    const bytes = [];
    let hasMojibakeChar = false;
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (CP1252_MAP[code] !== undefined) {
        bytes.push(CP1252_MAP[code]);
        hasMojibakeChar = true;
      } else if (code <= 0xFF) {
        bytes.push(code);
        if (code >= 0x80) hasMojibakeChar = true;
      } else {
        return s; // Contains characters outside CP1252/Latin-1
      }
    }
    if (!hasMojibakeChar) return s; // Pure ASCII
    const dec = new TextDecoder("utf-8", { fatal: true });
    return dec.decode(new Uint8Array(bytes)) || s;
  } catch {
    return s;
  }
}

function fixArgsMojibake(args) {
  if (!args || typeof args !== "object") return args;
  if (Array.isArray(args)) return args.map(fixArgsMojibake);
  const fixed = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      fixed[k] = fixMojibake(v);
    } else if (typeof v === "object" && v !== null) {
      fixed[k] = fixArgsMojibake(v);
    } else {
      fixed[k] = v;
    }
  }
  return fixed;
}

// ─── MCP Protocol Handler ───
async function handleMcpRequest(message) {
  const { jsonrpc, id, method, params } = message;

  if (jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } };
  }

  try {
    let result;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: { name: "browser-mcp-x", version: MCP_VERSION }
        };
        break;

      case "tools/list":
        result = { tools: MCP_TOOLS };
        break;

      case "tools/call":
        result = await executeTool(params.name, fixArgsMojibake(params.arguments || {}), null, message.sessionId || DEFAULT_SESSION_ID);
        break;

      case "notifications/initialized":
        return null; // No response for notifications

      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }

    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    console.error(`[Browser MCP X] Error handling ${method}:`, error);
    return {
      jsonrpc: "2.0", id,
      error: { code: -32603, message: error.message || "Internal error" }
    };
  }
}


// ─── Debugger-based screenshot ───
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);
}

// Trusted click via CDP — required when apps ignore synthetic el.click() (isTrusted=false).
async function trustedClickAt(tabId, x, y) {
  const target = { tabId };
  const dprResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.devicePixelRatio || 1
  });
  const dpr = dprResult[0]?.result || 1;
  // On Windows scaled displays, CDP often needs layout coordinates * DPR.
  const sx = Math.round(x * dpr);
  const sy = Math.round(y * dpr);

  await chrome.debugger.detach(target).catch(() => {});
  await withTimeout(chrome.debugger.attach(target, "1.3"), 5000, "debugger.attach");
  try {
    const base = { x: sx, y: sy, button: "left", clickCount: 1 };
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", ...base });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...base });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
    return true;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function captureWithDebugger(tabId, format = "jpeg", quality = 75) {
  const target = { tabId };
  let attached = false;

  // A previous call that hit the outer Promise.race timeout may have left its
  // own attach() still pending in the background — the debugger API then
  // refuses new attach() calls for this tab ("Another debugger is already
  // attached") or hangs waiting on the stale session's internal lock.
  // Clear any such zombie session before attaching a fresh one.
  await chrome.debugger.detach(target).catch(() => {});

  try {
    await withTimeout(chrome.debugger.attach(target, "1.3"), 5000, "debugger.attach");
    attached = true;

    const params = format === "png" ? { format: "png" } : { format: "jpeg", quality };
    const result = await withTimeout(
      chrome.debugger.sendCommand(target, "Page.captureScreenshot", params),
      15000,
      "Page.captureScreenshot"
    );
    return `data:image/${format};base64,${result.data}`;
  } finally {
    // Fire-and-forget: do NOT await detach — if the session is stuck,
    // awaiting detach would hang the finally block and the caller never returns.
    if (attached) chrome.debugger.detach(target).catch(() => {});
  }
}

// ─── Tool Execution ───
async function executeTool(toolName, args, overrideTabId = null, sessionId = DEFAULT_SESSION_ID) {
  const explicitTabId = args.tabId ?? args.id ?? overrideTabId;
  let tab = null;

  if (explicitTabId != null) {
    try {
      tab = await chrome.tabs.get(Number(explicitTabId));
    } catch (e) {
      // Tab not found or restricted
    }
  }

  const tabOptional = ["get_tabs", "switch_tab", "close_tab", "create_tab"].includes(toolName);
  if (!tab && !tabOptional) {
    tab = await getAgentTab(sessionId);
  }

  if (!tab && !tabOptional) {
    throw new Error("No active tab found");
  }

  if (tab) touchSession(sessionId, tab.id);

  if (tab && tab.id) {
    await showAgentFrame(tab.id);
  }

  switch (toolName) {
    case "navigate": {
      await chrome.tabs.update(tab.id, { url: args.url });
      await waitForTabLoad(tab.id);
      return { content: [{ type: "text", text: `Navigated to ${args.url}` }] };
    }

    case "screenshot": {
      try {
        const dataUrl = await captureWithDebugger(tab.id);
        return {
          content: [
            { type: "text", text: "Screenshot captured" },
            { type: "image", data: dataUrl.split(",")[1], mimeType: "image/jpeg" }
          ]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Screenshot failed: ${e.message}` }] };
      }
    }

    case "get_dom": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          const element = sel === "body" ? document.body : document.querySelector(sel);
          if (!element) return "Element not found";
          return buildAccessibleTree(element);
          function buildAccessibleTree(el, depth = 0) {
            if (!el || el.nodeType !== 1) return "";
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || "").trim().substring(0, 80);
            const role = el.getAttribute("role") || "";
            const aria = el.getAttribute("aria-label") || "";
            const href = el.getAttribute("href") || "";
            const name = el.getAttribute("name") || "";
            const id = el.id || "";
            const cls = el.className || "";
            const rect = el.getBoundingClientRect();
            const isInViewport = (
              rect.top >= 0 &&
              rect.left >= 0 &&
              rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
              rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
              rect.width > 0 &&
              rect.height > 0
            );
            let indent = "  ".repeat(depth);
            let line = `${indent}<${tag}`;
            if (id) line += ` #${id}`;
            if (cls) line += ` .${String(cls).substring(0, 40)}`;
            if (role) line += ` [${role}]`;
            if (aria) line += ` "${aria}"`;
            if (href) line += ` href="${href.substring(0, 60)}"`;
            if (name) line += ` name="${name}"`;
            line += ` [inViewport=${isInViewport}]`;
            if (text && text.length < 80 && el.children.length === 0) line += `>${text}</${tag}>`;
            else line += `>`;
            let result = line + "\n";
            for (const child of el.children) {
              if (depth < 5) result += buildAccessibleTree(child, depth + 1);
            }
            return result;
          }
        },
        args: [args.selector || "body"]
      });
      return { content: [{ type: "text", text: results[0]?.result || "Empty" }] };
    }

    case "click": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (sel) => {
          // Try main document first, then all frames.
          function findElement(root) {
            return root.querySelector(sel);
          }
          let el = findElement(document);
          if (!el) {
            for (const frame of document.querySelectorAll("iframe, frame")) {
              try {
                el = frame.contentDocument?.querySelector(sel);
                if (el) break;
              } catch (e) {}
            }
          }
          if (!el) return `Element not found: ${sel}`;
          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
          const rect = el.getBoundingClientRect();
          const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
          el.dispatchEvent(new PointerEvent("pointerdown", opts));
          el.dispatchEvent(new MouseEvent("mousedown", opts));
          el.dispatchEvent(new PointerEvent("pointerup", opts));
          el.dispatchEvent(new MouseEvent("mouseup", opts));
          el.dispatchEvent(new MouseEvent("click", opts));
          if (typeof el.click === "function") el.click();
          return `Clicked: ${sel}`;
        },
        args: [args.selector]
      });
      if (recordingState.isRecording) {
        recordingState.actions.push({ type: "click", selector: args.selector, timestamp: Date.now() });
      }
      const clickSnap = await captureAriaSnapshot(tab.id);
      return { content: [{ type: "text", text: results[0]?.result }, { type: "text", text: clickSnap }] };
    }

    case "type_text": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        world: "MAIN",
        func: (sel, text) => {
          function findElement(root) {
            return root.querySelector(sel);
          }
          let el = findElement(document);
          if (!el) {
            for (const frame of document.querySelectorAll("iframe, frame")) {
              try {
                el = frame.contentDocument?.querySelector(sel);
                if (el) break;
              } catch (e) {}
            }
          }
          if (!el) return `Element not found: ${sel}`;

          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
          el.focus();
          const isCE = el.isContentEditable || el.getAttribute("contenteditable") === "true";
          if (isCE) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
            const inserted = document.execCommand("insertText", false, text);
            if (!inserted) {
              el.textContent = text;
              el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
            }
            el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
            return `Typed into contenteditable ${sel}`;
          }

          const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) setter.call(el, text);
          else el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
          return `Typed "${text}" into ${sel}`;
        },
        args: [args.selector, args.text]
      });
      if (recordingState.isRecording) {
        recordingState.actions.push({ type: "type", selector: args.selector, text: args.text, timestamp: Date.now() });
      }
      const typeSnap = await captureAriaSnapshot(tab.id);
      return { content: [{ type: "text", text: results[0]?.result }, { type: "text", text: typeSnap }] };
    }

    case "click_text": {
      const targetText = fixMojibake(args.text ?? args.targetText ?? "");
      const isPartial = args.partial !== false;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (searchText, partial) => {
          if (!searchText) return "Error: No search text provided";

          const CP1252_MAP = {
            0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
            0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
            0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
            0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
            0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
            0x017E: 0x9E, 0x0178: 0x9F
          };

          function fixMojibakeInner(s) {
            if (typeof s !== "string" || !s) return s;
            try {
              const bytes = [];
              let hasMojibakeChar = false;
              for (let i = 0; i < s.length; i++) {
                const code = s.charCodeAt(i);
                if (CP1252_MAP[code] !== undefined) {
                  bytes.push(CP1252_MAP[code]);
                  hasMojibakeChar = true;
                } else if (code <= 0xFF) {
                  bytes.push(code);
                  if (code >= 0x80) hasMojibakeChar = true;
                } else {
                  return s;
                }
              }
              if (!hasMojibakeChar) return s;
              const dec = new TextDecoder("utf-8", { fatal: true });
              return dec.decode(new Uint8Array(bytes)) || s;
            } catch {
              return s;
            }
          }

          function stripVietnamese(s) {
            return (s || "")
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[đĐ]/g, (m) => (m === "đ" ? "d" : "d"));
          }

          function clean(s) {
            return (s || "").replace(/\s+/g, " ").trim();
          }

          const rawSearch = clean(searchText);
          const fixedSearch = clean(fixMojibakeInner(rawSearch));
          const searchNfc = fixedSearch.normalize("NFC");
          const searchLower = searchNfc.toLowerCase();
          const searchStripped = stripVietnamese(searchLower);

          // Priority selectors: buttons/links/interactive first, then generic containers
          const selectors = [
            "button", "a", "[role='button']", "[role='link']", "[role='tab']", "[role='menuitem']",
            "input[type='button']", "input[type='submit']", "input[type='reset']",
            "[onclick]", "label", "summary", "h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "span", "div"
          ];

          let bestMatch = null;
          let bestTier = 999;
          let bestScore = Infinity;

          function evaluateElement(el) {
            if (!el || el.nodeType !== 1) return;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;

            const rawText = clean(el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "");
            if (!rawText) return;

            const fixedElText = clean(fixMojibakeInner(rawText));
            const elNfc = fixedElText.normalize("NFC");
            const elLower = elNfc.toLowerCase();
            const elStripped = stripVietnamese(elLower);

            let tier = 999;
            if (elNfc === searchNfc) {
              tier = 1; // Exact match (case & diacritics)
            } else if (elLower === searchLower) {
              tier = 2; // Case-insensitive exact match
            } else if (elStripped === searchStripped) {
              tier = 3; // Accent-insensitive exact match (e.g. "Dang nhap" == "Đăng nhập")
            } else if (partial && elLower.includes(searchLower)) {
              tier = 4; // Case-insensitive substring match
            } else if (partial && elStripped.includes(searchStripped)) {
              tier = 5; // Accent-insensitive substring match
            }

            if (tier < 999) {
              const lengthScore = elNfc.length;
              if (tier < bestTier || (tier === bestTier && lengthScore < bestScore)) {
                bestTier = tier;
                bestScore = lengthScore;
                bestMatch = el;
              }
            }
          }

          // Search prioritized selectors first
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              evaluateElement(el);
            }
            if (bestMatch && bestTier <= 3 && bestScore <= searchNfc.length + 10) {
              break;
            }
          }

          // Fallback to TreeWalker if not found in selector list
          if (!bestMatch) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
            let node;
            while ((node = walker.nextNode())) {
              evaluateElement(node);
            }
          }

          if (bestMatch) {
            bestMatch.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
            const rect = bestMatch.getBoundingClientRect();
            const opts = {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2
            };
            bestMatch.dispatchEvent(new PointerEvent("pointerdown", opts));
            bestMatch.dispatchEvent(new MouseEvent("mousedown", opts));
            bestMatch.dispatchEvent(new PointerEvent("pointerup", opts));
            bestMatch.dispatchEvent(new MouseEvent("mouseup", opts));
            bestMatch.dispatchEvent(new MouseEvent("click", opts));
            if (typeof bestMatch.click === "function") bestMatch.click();
            const matchedText = clean(bestMatch.textContent || bestMatch.value || bestMatch.getAttribute("aria-label") || "").substring(0, 60);
            return `Clicked text: "${matchedText}"`;
          }

          return `No element found with text: "${searchText}"`;
        },
        args: [targetText, isPartial]
      });
      const clickedResult = results.find(r => r?.result && r.result.startsWith("Clicked text:"))?.result || results[0]?.result || `No element found with text: "${targetText}"`;
      return { content: [{ type: "text", text: clickedResult }] };
    }

    case "extract_text": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          const el = sel === "body" || !sel ? document.body : document.querySelector(sel);
          if (!el) return "Element not found";
          return (el.innerText || "").substring(0, 10000);
        },
        args: [args.selector || "body"]
      });
      return { content: [{ type: "text", text: results[0]?.result || "Empty" }] };
    }

    case "scroll": {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (dir, amt, sel) => {
          const el = sel ? document.querySelector(sel) : null;
          const delta = dir === "up" ? -amt : amt;
          if (el) {
            el.scrollTop += delta;
          } else {
            window.scrollBy({ top: delta, behavior: "smooth" });
          }
        },
        args: [args.direction || "down", args.amount || 500, args.selector || null]
      });
      return { content: [{ type: "text", text: `Scrolled ${args.direction || "down"} by ${args.amount || 500}px` }] };
    }

    case "get_tabs": {
      const tabs = await chrome.tabs.query({});
      const groupIds = [...new Set(tabs.map(t => t.groupId).filter(id => id >= 0))];
      const groupMap = {};
      for (const gid of groupIds) {
        try {
          const g = await chrome.tabGroups.get(gid);
          groupMap[gid] = { title: g.title, color: g.color };
        } catch (e) {}
      }
      const tabList = tabs.map(t => {
        const entry = { id: t.id, title: t.title, url: t.url, active: t.active };
        if (t.groupId >= 0) {
          entry.groupTitle = groupMap[t.groupId]?.title || "";
        }
        return entry;
      });
      return { content: [{ type: "text", text: JSON.stringify(tabList, null, 2) }] };
    }

    case "switch_tab": {
      const targetTabId = args.tabId ?? args.id;
      if (targetTabId == null) {
        return { content: [{ type: "text", text: "Error: missing tabId or id argument" }] };
      }
      await switchSessionTab(sessionId, Number(targetTabId));
      await chrome.tabs.update(Number(targetTabId), { active: true });
      return { content: [{ type: "text", text: `Switched to tab ${targetTabId}` }] };
    }

    case "close_tab": {
      const closeTabId = args.tabId ?? args.id;
      if (closeTabId == null) {
        return { content: [{ type: "text", text: "Error: missing tabId or id argument" }] };
      }
      await chrome.tabs.remove(closeTabId);
      return { content: [{ type: "text", text: `Closed tab ${closeTabId}` }] };
    }

    case "evaluate": {
      const scriptToRun = fixMojibake(args.script || "");
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: async (script) => {
          const CP1252_MAP = {
            0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
            0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
            0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
            0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
            0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
            0x017E: 0x9E, 0x0178: 0x9F
          };
          function fixMojibakeInner(s) {
            if (typeof s !== "string" || !s) return s;
            try {
              const bytes = [];
              let hasMojibakeChar = false;
              for (let i = 0; i < s.length; i++) {
                const code = s.charCodeAt(i);
                if (CP1252_MAP[code] !== undefined) {
                  bytes.push(CP1252_MAP[code]);
                  hasMojibakeChar = true;
                } else if (code <= 0xFF) {
                  bytes.push(code);
                  if (code >= 0x80) hasMojibakeChar = true;
                } else {
                  return s;
                }
              }
              if (!hasMojibakeChar) return s;
              const dec = new TextDecoder("utf-8", { fatal: true });
              return dec.decode(new Uint8Array(bytes)) || s;
            } catch {
              return s;
            }
          }
          const serialize = (v) => {
            if (v === undefined) return "undefined";
            if (typeof v === "string") return fixMojibakeInner(v);
            if (typeof v === "number" || typeof v === "boolean" || v === null) return String(v);
            try {
              return JSON.stringify(v);
            } catch {
              return String(v);
            }
          };
          try {
            const cleanScript = fixMojibakeInner(script);
            let result;
            try {
              result = (new Function("return (" + cleanScript + ")"))();
            } catch {
              result = (new Function(cleanScript))();
            }
            if (result != null && typeof result.then === "function") {
              result = await result;
            }
            return serialize(result);
          } catch (e) {
            return `Error: ${e.message}`;
          }
        },
        args: [scriptToRun]
      });
      return { content: [{ type: "text", text: fixMojibake(results[0]?.result || "undefined") }] };
    }

    case "get_page_info": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          title: document.title,
          url: window.location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scroll: { x: window.scrollX, y: window.scrollY }
        })
      });
      return { content: [{ type: "text", text: JSON.stringify(results[0]?.result, null, 2) }] };
    }

    case "fill_form": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (fields) => {
          const results = [];
          for (const [sel, val] of Object.entries(fields)) {
            function findElement(root) {
              return root.querySelector(sel);
            }
            let el = findElement(document);
            if (!el) {
              for (const frame of document.querySelectorAll("iframe, frame")) {
                try {
                  el = frame.contentDocument?.querySelector(sel);
                  if (el) break;
                } catch (e) {}
              }
            }
            if (!el) { results.push(`${sel}: not found`); continue; }
            el.focus();
            el.value = val;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new InputEvent("input", { bubbles: true, data: val, inputType: "insertText" }));
            results.push(`${sel}: filled`);
          }
          return results.join("\n");
        },
        args: [args.fields]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "wait": {
      await new Promise(r => setTimeout(r, args.ms || 1000));
      return { content: [{ type: "text", text: `Waited ${args.ms || 1000}ms` }] };
    }

    case "press_key": {
      const keyCombo = args.key;
      const parts = String(keyCombo).split("+").map((s) => s.trim()).filter(Boolean);
      const keyRaw = parts[parts.length - 1] || keyCombo;
      const mods = {
        ctrlKey: parts.some((p) => /^(control|ctrl)$/i.test(p)),
        altKey: parts.some((p) => /^alt$/i.test(p)),
        shiftKey: parts.some((p) => /^shift$/i.test(p)),
        metaKey: parts.some((p) => /^(meta|cmd|command)$/i.test(p))
      };

      // Prefer CDP trusted key events — many SPAs ignore synthetic KeyboardEvent (isTrusted=false).
      try {
        const target = { tabId: tab.id };
        await chrome.debugger.detach(target).catch(() => {});
        await withTimeout(chrome.debugger.attach(target, "1.3"), 5000, "debugger.attach");
        try {
          const key = keyRaw.length === 1 ? keyRaw : keyRaw;
          const code = key.length === 1 ? `Key${key.toUpperCase()}` : (key === "Enter" ? "Enter" : key);
          const base = {
            text: key.length === 1 ? key : (key === "Enter" ? "\r" : ""),
            unmodifiedText: key.length === 1 ? key : (key === "Enter" ? "\r" : ""),
            code,
            key,
            windowsVirtualKeyCode: key === "Enter" ? 13 : (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0),
            nativeVirtualKeyCode: key === "Enter" ? 13 : (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0),
            modifiers: (mods.altKey ? 1 : 0) | (mods.ctrlKey ? 2 : 0) | (mods.metaKey ? 4 : 0) | (mods.shiftKey ? 8 : 0)
          };
          await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", ...base });
          if (key.length === 1 || key === "Enter") {
            await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "char", ...base });
          }
          await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
        } finally {
          await chrome.debugger.detach(target).catch(() => {});
        }
        if (recordingState.isRecording) {
          recordingState.actions.push({ type: "key", key: args.key, timestamp: Date.now() });
        }
        return { content: [{ type: "text", text: `Pressed ${keyCombo} via cdp` }] };
      } catch (e) {
        // Fallback synthetic
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: (combo) => {
            const parts = String(combo).split("+").map((s) => s.trim()).filter(Boolean);
            const key = parts[parts.length - 1] || combo;
            const mods = {
              ctrlKey: parts.some((p) => /^(control|ctrl)$/i.test(p)),
              altKey: parts.some((p) => /^alt$/i.test(p)),
              shiftKey: parts.some((p) => /^shift$/i.test(p)),
              metaKey: parts.some((p) => /^(meta|cmd|command)$/i.test(p))
            };
            const targetEl = document.activeElement || document.body;
            const opts = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, bubbles: true, cancelable: true, ...mods };
            targetEl.dispatchEvent(new KeyboardEvent("keydown", opts));
            targetEl.dispatchEvent(new KeyboardEvent("keypress", opts));
            targetEl.dispatchEvent(new KeyboardEvent("keyup", opts));
            return `Pressed ${combo} on ${targetEl.tagName} (synthetic fallback)`;
          },
          args: [keyCombo]
        });
        return { content: [{ type: "text", text: `${results[0]?.result}; cdp failed: ${e.message}` }] };
      }
    }

    case "get_links": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return Array.from(document.querySelectorAll("a[href]")).slice(0, 100).map(a => ({
            text: (a.textContent || "").trim().substring(0, 80),
            href: a.href
          }));
        }
      });
      return { content: [{ type: "text", text: JSON.stringify(results[0]?.result, null, 2) }] };
    }

    // ─── Recording / Playback ───
    case "start_recording": {
      recordingState = { isRecording: true, actions: [], recordingTabId: tab.id };
      // Inject recording listener. We record clicks, inputs, and keydowns.
      // The listener sends actions back to the service worker via a named global
      // that stop_recording can read, and also attempts runtime.sendMessage.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.__browserMcpRecording) return "already recording";
          window.__browserMcpRecording = true;
          window.__browserMcpActions = [];

          function pushAction(action) {
            window.__browserMcpActions.push(action);
            // Best-effort live forwarding to service worker (may fail if extension reloaded)
            try {
              if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ type: "RECORDING_ACTION", action }).catch(() => {});
              }
            } catch (e) {}
          }

          function selectorFor(el) {
            if (!el) return "";
            if (el.id) return `#${el.id}`;
            if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
            if (el.className) {
              const cls = String(el.className).split(" ").filter(c => c).slice(0, 2).join(".");
              if (cls) return `${el.tagName.toLowerCase()}.${cls}`;
            }
            return el.tagName.toLowerCase();
          }

          const clickHandler = (e) => {
            pushAction({
              type: "click",
              selector: selectorFor(e.target),
              tag: e.target?.tagName?.toLowerCase() || "",
              text: (e.target?.textContent || "").trim().substring(0, 40),
              timestamp: Date.now()
            });
          };

          const inputHandler = (e) => {
            const target = e.target;
            if (!target?.value && target?.value !== "") return;
            pushAction({
              type: "type",
              selector: selectorFor(target),
              text: String(target.value || "").substring(0, 200),
              tag: target?.tagName?.toLowerCase() || "",
              timestamp: Date.now()
            });
          };

          const keyHandler = (e) => {
            pushAction({
              type: "key",
              key: e.key,
              selector: selectorFor(e.target),
              timestamp: Date.now()
            });
          };

          document.addEventListener("click", clickHandler, true);
          document.addEventListener("input", inputHandler, true);
          document.addEventListener("keydown", keyHandler, true);

          window.__browserMcpStopRecording = () => {
            document.removeEventListener("click", clickHandler, true);
            document.removeEventListener("input", inputHandler, true);
            document.removeEventListener("keydown", keyHandler, true);
            window.__browserMcpRecording = false;
            const actions = window.__browserMcpActions || [];
            window.__browserMcpActions = [];
            return actions;
          };

          return "recording started";
        }
      });
      return { content: [{ type: "text", text: "Recording started. Interact with the page — actions are being captured." }] };
    }

    case "stop_recording": {
      if (!recordingState.isRecording) {
        return { content: [{ type: "text", text: "Not recording." }] };
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId: recordingState.recordingTabId || tab.id },
        func: () => {
          if (typeof window.__browserMcpStopRecording === "function") {
            const actions = window.__browserMcpStopRecording();
            return { stopped: true, actions };
          }
          const actions = window.__browserMcpActions || [];
          window.__browserMcpRecording = false;
          window.__browserMcpActions = [];
          return { stopped: false, actions };
        }
      });
      const data = results[0]?.result || { actions: [] };
      recordingState.isRecording = false;
      // Merge service-worker recorded actions (from our own tools) with content-script captured actions.
      const contentActions = data.actions || [];
      const allActions = [...recordingState.actions || [], ...contentActions];
      // Deduplicate by timestamp (1ms resolution)
      const seen = new Set();
      const deduped = [];
      for (const a of allActions) {
        const key = `${a.type}:${a.selector || a.key || a.text}:${a.timestamp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(a);
      }
      recordingState.actions = [];
      deduped.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return { content: [{ type: "text", text: JSON.stringify({ recorded: deduped.length, actions: deduped }, null, 2) }] };
    }

    case "playback": {
      const actions = args.actions || [];
      const speed = args.speed || 1;
      for (const action of actions) {
        const delay = 500 / speed;
        await new Promise(r => setTimeout(r, delay));
        if (action.type === "click") {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (sel) => { const el = document.querySelector(sel); if (el) el.click(); },
            args: [action.selector]
          });
        } else if (action.type === "type") {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (sel, text) => {
              const el = document.querySelector(sel);
              if (el) { el.focus(); el.value = text; el.dispatchEvent(new Event("input", { bubbles: true })); }
            },
            args: [action.selector, action.text]
          });
        } else if (action.type === "navigate") {
          await chrome.tabs.update(tab.id, { url: action.url });
          await waitForTabLoad(tab.id);
        }
      }
      return { content: [{ type: "text", text: `Playback complete: ${actions.length} actions executed.` }] };
    }

    // ─── Form Detection ───
    case "detect_forms": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const forms = Array.from(document.querySelectorAll("form"));
          return forms.map((form, idx) => {
            const fields = Array.from(form.querySelectorAll("input, select, textarea")).map(el => ({
              tag: el.tagName.toLowerCase(),
              type: el.type || "",
              name: el.name || "",
              id: el.id || "",
              label: el.getAttribute("aria-label") || (el.labels?.[0]?.textContent?.trim() || ""),
              required: el.required,
              placeholder: el.placeholder || "",
              selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : `${el.tagName.toLowerCase()}:nth-of-type(1)`,
              value: el.value || ""
            }));
            return { formIndex: idx, action: form.action || "", method: form.method || "get", fieldCount: fields.length, fields };
          });
        }
      });
      return { content: [{ type: "text", text: JSON.stringify(results[0]?.result || [], null, 2) }] };
    }

    case "auto_fill_form": {
      const selector = args.selector || "form";
      const values = args.values || {};
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel, vals) => {
          const form = document.querySelector(sel);
          if (!form) return `Form not found: ${sel}`;
          const fields = Array.from(form.querySelectorAll("input, select, textarea"));
          const filled = [];
          for (const el of fields) {
            const key = el.id || el.name || el.type;
            const val = vals[key] || vals[el.name] || vals[el.id] || "";
            if (val) {
              el.focus();
              el.value = val;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              filled.push(`${key}="${val}"`);
            }
          }
          return `Filled ${filled.length} fields: ${filled.join(", ")}`;
        },
        args: [selector, values]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    // ─── Multi-Tab Workflows ───
    case "create_tab": {
      const url = args.url || "about:blank";
      const active = args.active === true;
      let newTab;
      if (args.newWindow) {
        const newWin = await chrome.windows.create({ url, active, focused: active });
        newTab = newWin.tabs[0];
      } else {
        const windowId = tab ? tab.windowId : undefined;
        newTab = await chrome.tabs.create({ windowId, url, active });
      }
      try {
        await registerCreatedTab(sessionId, newTab.id, !args.newWindow);
      } catch (e) {
        console.warn("[Browser MCP X] Failed to register created tab:", e);
      }
      if (args.url) await waitForTabLoad(newTab.id);
      return { content: [{ type: "text", text: `Created tab ${newTab.id} with URL: ${url}${args.newWindow ? " (new window)" : ""}` }] };
    }

    case "batch_execute": {
      const steps = args.steps || [];
      const targetTabId = args.tabId || tab.id;
      const results = [];
      for (const step of steps) {
        try {
          const stepResult = await executeTool(step.tool, step.args || {}, targetTabId, sessionId);
          results.push({ tool: step.tool, success: true, result: stepResult });
        } catch (e) {
          results.push({ tool: step.tool, success: false, error: e.message });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    case "get_console_logs": {
      const level = args.level || "all";
      // Injects a script that wraps console.log/warn/error to record output;
      // does not use chrome.debugger.
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (lvl) => {
          if (!window.__browserMcpLogs) {
            window.__browserMcpLogs = [];
            const origLog = console.log;
            const origWarn = console.warn;
            const origError = console.error;
            console.log = (...args) => { window.__browserMcpLogs.push({ level: "log", args: args.map(String), time: Date.now() }); origLog(...args); };
            console.warn = (...args) => { window.__browserMcpLogs.push({ level: "warn", args: args.map(String), time: Date.now() }); origWarn(...args); };
            console.error = (...args) => { window.__browserMcpLogs.push({ level: "error", args: args.map(String), time: Date.now() }); origError(...args); };
          }
          window.onerror = (msg, url, line, col, err) => {
            window.__browserMcpLogs.push({ level: "error", args: [`${msg} at ${url}:${line}:${col}`], time: Date.now() });
          };
          const logs = window.__browserMcpLogs || [];
          return lvl === "all" ? logs : logs.filter(l => l.level === lvl);
        },
        args: [level]
      });
      return { content: [{ type: "text", text: JSON.stringify(results[0]?.result || [], null, 2) }] };
    }

    case "get_network_requests": {
      const filterStr = (args.filter || "").toLowerCase();
      const reqType = args.type || "all";
      const limit = args.limit || 50;
      const includeHeaders = args.includeHeaders !== false;

      let filtered = capturedRequests.filter(r => {
        const matchesUrl = !filterStr || r.url.toLowerCase().includes(filterStr);
        const matchesType = reqType === "all" || r.type === reqType;
        return matchesUrl && matchesType;
      });

      if (filtered.length === 0) {
        // Fallback to Performance API if no captured requests yet
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (filterStr) => {
            const entries = performance.getEntriesByType("resource");
            return entries.map(e => ({
              url: e.name,
              type: e.initiatorType,
              duration: Math.round(e.duration),
              size: e.transferSize || 0
            })).filter(r => !filterStr || r.url.toLowerCase().includes(filterStr));
          },
          args: [filterStr]
        });
        filtered = results[0]?.result || [];
      } else {
        filtered = filtered.slice(-limit).map(r => {
          const item = {
            id: r.id,
            url: r.url,
            method: r.method,
            type: r.type,
            statusCode: r.statusCode,
            timestamp: r.timestamp
          };
          if (includeHeaders) {
            item.headers = r.headers;
            item.requestBody = r.requestBody;
          }
          return item;
        });
      }

      return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
    }

    case "get_api_requests": {
      const filterStr = (args.filter || "").toLowerCase();
      const limit = args.limit || 20;

      const apiRequests = capturedRequests.filter(r => {
        const isApiType = r.type === "xmlhttprequest" || r.type === "fetch" || r.url.includes("/api/") || r.url.includes("/graphql") || r.url.includes("/v1/") || r.url.includes("/v2/");
        const matchesFilter = !filterStr || r.url.toLowerCase().includes(filterStr);
        return isApiType && matchesFilter;
      }).slice(-limit).map(r => {
        const authHeaders = {};
        if (r.headers) {
          for (const [k, v] of Object.entries(r.headers)) {
            const lk = k.toLowerCase();
            if (lk.includes("auth") || lk.includes("token") || lk.includes("cookie") || lk.includes("key") || lk.includes("csrf")) {
              authHeaders[k] = v;
            }
          }
        }
        return {
          id: r.id,
          url: r.url,
          method: r.method,
          type: r.type,
          statusCode: r.statusCode,
          timestamp: r.timestamp,
          authHeaders,
          requestHeaders: r.headers,
          requestBody: r.requestBody
        };
      });

      return { content: [{ type: "text", text: JSON.stringify(apiRequests, null, 2) }] };
    }

    case "get_curl_command": {
      const pattern = (args.urlPattern || "").toLowerCase();
      const index = args.requestIndex || 0;

      const matches = capturedRequests.filter(r => r.url.toLowerCase().includes(pattern));
      if (matches.length === 0) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `No captured network requests matching URL pattern: "${args.urlPattern}"` }, null, 2)
          }]
        };
      }

      const req = matches[Math.min(index, matches.length - 1)];
      let curl = `curl -X ${req.method} '${req.url}'`;

      if (req.headers) {
        for (const [key, value] of Object.entries(req.headers)) {
          if (key.startsWith(":") || !value) continue;
          const safeVal = String(value).replace(/'/g, "'\\''");
          curl += ` \\\n  -H '${key}: ${safeVal}'`;
        }
      }

      if (req.requestBody) {
        const safeBody = String(req.requestBody).replace(/'/g, "'\\''");
        curl += ` \\\n  --data-raw '${safeBody}'`;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            url: req.url,
            method: req.method,
            curlCommand: curl
          }, null, 2)
        }]
      };
    }

    case "export_api_session": {
      let targetDomain = args.domain;
      if (!targetDomain && tab && tab.url) {
        try {
          const urlObj = new URL(tab.url);
          targetDomain = urlObj.hostname;
        } catch (e) {
          targetDomain = "";
        }
      }

      let cookies = [];
      if (targetDomain && chrome.cookies) {
        try {
          cookies = await chrome.cookies.getAll({ domain: targetDomain });
        } catch (e) {
          try {
            if (tab && tab.url) cookies = await chrome.cookies.getAll({ url: tab.url });
          } catch (err) {}
        }
      }

      const capturedAuthHeaders = {};
      const domainReqs = capturedRequests.filter(r => targetDomain && r.url.toLowerCase().includes(targetDomain.toLowerCase()));
      for (const req of domainReqs) {
        if (req.headers) {
          for (const [k, v] of Object.entries(req.headers)) {
            const lk = k.toLowerCase();
            if (lk.includes("auth") || lk.includes("token") || lk.includes("bearer") || lk.includes("csrf") || lk.includes("api-key")) {
              capturedAuthHeaders[k] = v;
            }
          }
        }
      }

      const cookieDict = {};
      for (const c of cookies) {
        cookieDict[c.name] = c.value;
      }

      const pythonCode = `import requests

session = requests.Session()

# Cookies
cookies = ${JSON.stringify(cookieDict, null, 4)}
session.cookies.update(cookies)

# Auth & Custom Headers
headers = ${JSON.stringify(capturedAuthHeaders, null, 4)}
session.headers.update(headers)

# Example API Call:
# response = session.get("${(tab && tab.url) ? tab.url : "https://" + targetDomain}")
# print(response.status_code, response.text)
`;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            domain: targetDomain,
            cookieCount: cookies.length,
            cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly })),
            authHeaders: capturedAuthHeaders,
            pythonSnippet: pythonCode
          }, null, 2)
        }]
      };
    }

    // ─── Phase 1: Quick Wins ───

    case "highlight": {
      const { selector, color = "#E55934", duration = 3000 } = args;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel, col, dur) => {
          // Remove existing highlights
          document.querySelectorAll("[data-mcp-highlight]").forEach(el => {
            el.style.outline = el.dataset.mcpPrevOutline || "";
            delete el.dataset.mcpHighlight;
            delete el.dataset.mcpPrevOutline;
          });
          if (dur === 0) return "Highlights removed";

          const el = document.querySelector(sel);
          if (!el) return `Element not found: ${sel}`;
          el.dataset.mcpPrevOutline = el.style.outline || "";
          el.dataset.mcpHighlight = "true";
          el.style.outline = `3px solid ${col}`;
          el.style.outlineOffset = "2px";
          el.scrollIntoView({ behavior: "smooth", block: "center" });

          if (dur > 0) {
            setTimeout(() => {
              el.style.outline = el.dataset.mcpPrevOutline || "";
              delete el.dataset.mcpHighlight;
              delete el.dataset.mcpPrevOutline;
            }, dur);
          }
          return `Highlighted: ${sel}`;
        },
        args: [selector, color, duration]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "wait_for_element": {
      const { selector, timeout = 10000, visible = true } = args;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (sel, vis) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            if (!vis) return true;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
          },
          args: [selector, visible]
        });
        if (results[0]?.result) {
          return { content: [{ type: "text", text: `Element found: ${selector} (waited ${Date.now() - startTime}ms)` }] };
        }
        await new Promise(r => setTimeout(r, 200));
      }
      return { content: [{ type: "text", text: `Timeout: Element "${selector}" not found after ${timeout}ms` }] };
    }

    case "get_interactive_elements": {
      const filter = args.filter || "all";
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: (flt, selectorMap) => {
          function cssPath(el) {
            if (el.id) return `#${CSS.escape(el.id)}`;
            const parts = [];
            let cur = el;
            while (cur && cur.nodeType === 1 && parts.length < 8) {
              let part = cur.tagName.toLowerCase();
              if (cur.id) {
                parts.unshift(`#${CSS.escape(cur.id)}`);
                break;
              }
              const parent = cur.parentElement;
              if (parent) {
                const siblings = [...parent.children].filter((c) => c.tagName === cur.tagName);
                if (siblings.length > 1) {
                  part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
                }
              }
              parts.unshift(part);
              if (cur === document.body || cur === document.documentElement) break;
              cur = parent;
            }
            return parts.join(" > ");
          }

          const elements = [];
          const els = document.querySelectorAll(selectorMap[flt] || selectorMap.all);
          els.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const text = (el.textContent || el.value || el.placeholder || el.getAttribute("aria-label") || "")
              .trim()
              .substring(0, 60);
            const tag = el.tagName.toLowerCase();
            const type = el.type || el.getAttribute("role") || "";
            const path = cssPath(el);
            const isInViewport = (
              rect.top >= 0 &&
              rect.left >= 0 &&
              rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
              rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
              rect.width > 0 &&
              rect.height > 0
            );
            elements.push({
              id: elements.length,
              tag,
              type,
              text,
              selector: path,
              isInViewport,
              position: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
              }
            });
          });
          return elements.slice(0, 100);
        },
        args: [filter, INTERACTIVE_SELECTORS]
      });
      const items = results[0]?.result || [];
      interactiveElementCache.set(tab.id, { filter, items });
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    }

    case "click_by_id": {
      const elementId = args.elementId;
      const cached = interactiveElementCache.get(tab.id)?.items.find((i) => i.id === elementId) ?? null;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: (id, cachedItem, selectorMap) => {
          let el = null;
          let via = "index";
          if (cachedItem?.selector) {
            try {
              el = document.querySelector(cachedItem.selector);
              if (el) via = "cache";
            } catch (e) {}
          }
          if (!el) {
            const els = document.querySelectorAll(selectorMap.all);
            let count = 0;
            for (const candidate of els) {
              const rect = candidate.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) continue;
              if (count === id) {
                el = candidate;
                via = "index-fallback";
                break;
              }
              count++;
            }
          }
          if (!el) return { ok: false, error: `Element #${id} not found` };
          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
          const rect = el.getBoundingClientRect();
          const label = (el.textContent || el.value || "").trim().substring(0, 40);
          return {
            ok: true,
            via,
            label,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          };
        },
        args: [elementId, cached || null, INTERACTIVE_SELECTORS]
      });
      const loc = results[0]?.result;
      if (!loc?.ok) {
        return { content: [{ type: "text", text: loc?.error || `Element #${elementId} not found` }] };
      }
      try {
        await trustedClickAt(tab.id, loc.x, loc.y);
        return { content: [{ type: "text", text: `Clicked element #${elementId} via ${loc.via}+cdp: ${loc.label}` }] };
      } catch (e) {
        // Fallback synthetic click
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: (sel) => {
            const el = document.querySelector(sel);
            if (el) el.click();
          },
          args: [cached?.selector || null]
        });
        return { content: [{ type: "text", text: `Clicked element #${elementId} via ${loc.via} (cdp failed: ${e.message}): ${loc.label}` }] };
      }
    }

    case "type_by_id": {
      const elementId = args.elementId;
      const cached = interactiveElementCache.get(tab.id)?.items.find((i) => i.id === elementId) ?? null;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: (id, text, cachedItem, selectorMap) => {
          let el = null;
          if (cachedItem?.selector) {
            try {
              el = document.querySelector(cachedItem.selector);
            } catch (e) {}
          }
          if (!el) {
            const els = document.querySelectorAll(selectorMap.all);
            let count = 0;
            for (const candidate of els) {
              const rect = candidate.getBoundingClientRect();
              if (rect.width === 0 && rect.height === 0) continue;
              if (count === id) {
                el = candidate;
                break;
              }
              count++;
            }
          }
          if (!el) return `Element #${id} not found`;

          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
          el.focus();
          const isCE = el.isContentEditable || el.getAttribute("contenteditable") === "true";
          if (isCE) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
            const inserted = document.execCommand("insertText", false, text);
            if (!inserted) {
              el.textContent = text;
            }
            el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
            return `Typed into contenteditable #${id}`;
          }

          const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) setter.call(el, text);
          else el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
          return `Typed "${text}" into element #${id}`;
        },
        args: [elementId, args.text, cached || null, INTERACTIVE_SELECTORS]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }


    case "hover": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          const el = document.querySelector(sel);
          if (!el) return `Element not found: ${sel}`;
          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
          const events = ["mouseenter", "mouseover", "mousemove", "hover"];
          for (const type of events) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          }
          return `Hovered: ${sel}`;
        },
        args: [args.selector]
      });
      const hoverSnap = await captureAriaSnapshot(tab.id);
      return { content: [{ type: "text", text: results[0]?.result }, { type: "text", text: hoverSnap }] };
    }

    case "drag_and_drop": {
      const { source, target } = args;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (srcSel, tgtSel) => {
          const src = document.querySelector(srcSel);
          const tgt = document.querySelector(tgtSel);
          if (!src) return `Source not found: ${srcSel}`;
          if (!tgt) return `Target not found: ${tgtSel}`;
          const dragStart = new DragEvent("dragstart", { bubbles: true, cancelable: true });
          const dragOver = new DragEvent("dragover", { bubbles: true, cancelable: true });
          const drop = new DragEvent("drop", { bubbles: true, cancelable: true });
          const dragEnd = new DragEvent("dragend", { bubbles: true, cancelable: true });
          src.dispatchEvent(dragStart);
          tgt.dispatchEvent(dragOver);
          tgt.dispatchEvent(drop);
          src.dispatchEvent(dragEnd);
          return `Dragged ${srcSel} → ${tgtSel}`;
        },
        args: [source, target]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "handle_dialog": {
      const { action = "accept", text: dialogText } = args;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (act, txt) => {
          window.__mcpDialogAction = act;
          window.__mcpDialogText = txt || "";
          if (!window.__mcpDialogOverridden) {
            window.__mcpDialogOverridden = true;
            window.alert = () => {};
            window.confirm = () => act === "accept";
            window.prompt = (msg, def) => txt || def || "";
          }
          return `Dialog handler set: ${act}${txt ? ` (text: "${txt}")` : ""}`;
        },
        args: [action, dialogText || ""]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "get_markdown": {
      const { selector = "body", max_length = 10000 } = args;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel, maxLen) => {
          const el = sel === "body" ? document.body : document.querySelector(sel);
          if (!el) return "Element not found";

          function toMarkdown(node, depth = 0) {
            let md = "";
            for (const child of node.childNodes) {
              if (child.nodeType === 3) { // Text node
                const text = child.textContent.trim();
                if (text) md += text + " ";
              } else if (child.nodeType === 1) {
                const tag = child.tagName.toLowerCase();
                switch (tag) {
                  case "h1": md += `\n# ${child.textContent.trim()}\n\n`; break;
                  case "h2": md += `\n## ${child.textContent.trim()}\n\n`; break;
                  case "h3": md += `\n### ${child.textContent.trim()}\n\n`; break;
                  case "h4": md += `\n#### ${child.textContent.trim()}\n\n`; break;
                  case "h5": md += `\n##### ${child.textContent.trim()}\n\n`; break;
                  case "h6": md += `\n###### ${child.textContent.trim()}\n\n`; break;
                  case "p": md += `\n${toMarkdown(child)}\n\n`; break;
                  case "a": md += `[${child.textContent.trim()}](${child.href})`; break;
                  case "img": md += `![${child.alt || ""}](${child.src})`; break;
                  case "ul": case "ol":
                    md += "\n";
                    for (const li of child.children) {
                      md += `${tag === "ol" ? "1." : "-"} ${li.textContent.trim()}\n`;
                    }
                    md += "\n";
                    break;
                  case "table":
                    const rows = child.querySelectorAll("tr");
                    if (rows.length > 0) {
                      const headers = Array.from(rows[0].querySelectorAll("th,td")).map(c => c.textContent.trim());
                      md += `\n| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
                      for (let i = 1; i < rows.length; i++) {
                        const cells = Array.from(rows[i].querySelectorAll("td,th")).map(c => c.textContent.trim());
                        md += `| ${cells.join(" | ")} |\n`;
                      }
                      md += "\n";
                    }
                    break;
                  case "pre":
                    md += `\n\`\`\`\n${child.textContent.trim()}\n\`\`\`\n\n`;
                    break;
                  case "code":
                    md += `\`${child.textContent.trim()}\``;
                    break;
                  case "blockquote":
                    md += `\n> ${child.textContent.trim()}\n\n`;
                    break;
                  case "br": md += "\n"; break;
                  case "hr": md += "\n---\n\n"; break;
                  case "div": case "section": case "article": case "main": case "header": case "footer": case "nav":
                    md += toMarkdown(child, depth + 1); break;
                  default: md += toMarkdown(child, depth); break;
                }
              }
            }
            return md;
          }

          let result = toMarkdown(el);
          if (result.length > maxLen) result = result.substring(0, maxLen) + "\n\n[... truncated]";
          return result;
        },
        args: [selector, max_length]
      });
      return { content: [{ type: "text", text: results[0]?.result || "Empty" }] };
    }

    case "snapshot": {
      const snap = await captureAriaSnapshot(tab.id);
      return { content: [{ type: "text", text: snap }] };
    }

    case "select_option": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel, value, text, index) => {
          const el = document.querySelector(sel);
          if (!el || el.tagName.toLowerCase() !== "select") return `select not found: ${sel}`;
          el.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
          if (value !== undefined) {
            el.value = value;
          } else if (text !== undefined) {
            const opt = Array.from(el.options).find(o => o.text.trim().toLowerCase().includes(text.toLowerCase()));
            if (!opt) return `option "${text}" not found in ${sel}`;
            el.value = opt.value;
          } else if (index !== undefined) {
            if (index < 0 || index >= el.options.length) return `index ${index} out of range (${el.options.length} options)`;
            el.selectedIndex = index;
          } else {
            return "pass value, text, or index";
          }
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          const selected = el.options[el.selectedIndex];
          return `Selected "${selected?.text}" in ${sel}`;
        },
        args: [args.selector, args.value, args.text, args.index]
      });
      const snap = await captureAriaSnapshot(tab.id);
      return { content: [{ type: "text", text: results[0]?.result }, { type: "text", text: snap }] };
    }

    case "download_image": {
      const selector = args.selector || null;
      const filename = args.filename || `browser-mcp-${Date.now()}.png`;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: async (sel, fname) => {
          const largestImg = () => [...document.querySelectorAll("img")]
            .filter((i) => i.naturalWidth > 200)
            .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];

          let img = null;
          if (sel) {
            const el = document.querySelector(sel);
            if (el?.tagName === "IMG" && el.naturalWidth) img = el;
          }
          if (!img) img = largestImg();
          if (!img || !img.naturalWidth) return { ok: false, error: "Image not found" };

          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          try {
            canvas.getContext("2d").drawImage(img, 0, 0);
          } catch (e) {
            return { ok: false, error: `Canvas failed: ${e.message}` };
          }

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!blob) return { ok: false, error: "toBlob failed" };

          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          return { ok: true, size: blob.size, w: img.naturalWidth, h: img.naturalHeight, filename: fname };
        },
        args: [selector, filename]
      });
      const payload = results[0]?.result || { ok: false, error: "no result" };
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    }

    case "file_upload": {
      const { selector, filename, mimeType = "application/octet-stream", base64Data } = args;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: (sel, fname, mime, b64) => {
          const input = document.querySelector(sel);
          if (!input || input.type !== "file") return `File input not found: ${sel}`;
          try {
            const byteCharacters = atob(b64);
            const byteArray = new Uint8Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteArray[i] = byteCharacters.charCodeAt(i);
            }
            const blob = new Blob([byteArray], { type: mime });
            const file = new File([blob], fname, { type: mime, lastModified: Date.now() });
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return `Uploaded "${fname}" (${byteArray.length} bytes) to ${sel}`;
          } catch (e) {
            return `Upload failed: ${e.message}`;
          }
        },
        args: [selector, filename, mimeType, base64Data]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "resize_window": {
      const { width, height, left, top } = args;
      const currentTab = await chrome.tabs.get(tab.id);
      const updateProps = { state: "normal" };
      if (width != null) updateProps.width = Math.round(width);
      if (height != null) updateProps.height = Math.round(height);
      if (left != null) updateProps.left = Math.round(left);
      if (top != null) updateProps.top = Math.round(top);
      await chrome.windows.update(currentTab.windowId, updateProps);
      const updated = await chrome.windows.get(currentTab.windowId);
      return { content: [{ type: "text", text: `Window resized to ${updated.width}x${updated.height} at (${updated.left}, ${updated.top})` }] };
    }

    case "computer": {
      const { action, x, y, text: typeText, key: keyCombo, direction = "down", amount = 300 } = args;
      const cdpTarget = { tabId: tab.id };

      if (action === "type") {
        await chrome.debugger.detach(cdpTarget).catch(() => {});
        await withTimeout(chrome.debugger.attach(cdpTarget, "1.3"), 5000, "debugger.attach");
        try {
          await chrome.debugger.sendCommand(cdpTarget, "Input.insertText", { text: typeText || "" });
        } finally {
          await chrome.debugger.detach(cdpTarget).catch(() => {});
        }
        const dataUrl = await captureWithDebugger(tab.id);
        return {
          content: [
            { type: "text", text: `Typed: "${typeText}"` },
            { type: "image", data: dataUrl.split(",")[1], mimeType: "image/jpeg" }
          ]
        };
      }

      if (action === "key") {
        const keyResult = await executeTool("press_key", { key: keyCombo }, tab.id, sessionId);
        const dataUrl = await captureWithDebugger(tab.id);
        return {
          content: [
            ...(keyResult.content || []),
            { type: "image", data: dataUrl.split(",")[1], mimeType: "image/jpeg" }
          ]
        };
      }

      if (action === "scroll") {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (px, py, dir, amt) => {
            const delta = dir === "up" || dir === "left" ? -amt : amt;
            const el = document.elementFromPoint(px, py) || document.scrollingElement || document.body;
            if (dir === "left" || dir === "right") {
              el.scrollLeft += delta;
              if (el === document.body) window.scrollBy(delta, 0);
            } else {
              el.scrollTop += delta;
              if (el === document.body) window.scrollBy(0, delta);
            }
          },
          args: [x || 0, y || 0, direction, amount]
        });
        const dataUrl = await captureWithDebugger(tab.id);
        return {
          content: [
            { type: "text", text: `Scrolled ${direction} by ${amount}px at (${x}, ${y})` },
            { type: "image", data: dataUrl.split(",")[1], mimeType: "image/jpeg" }
          ]
        };
      }

      // Click / mouse_move actions via CDP
      const buttonMap = { left_click: "left", right_click: "right", middle_click: "middle", double_click: "left", mouse_move: "none" };
      const button = buttonMap[action] || "left";
      const clickCount = action === "double_click" ? 2 : (action === "mouse_move" ? 0 : 1);

      const dprResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.devicePixelRatio || 1
      });
      const dpr = dprResult[0]?.result || 1;
      const sx = Math.round((x || 0) * dpr);
      const sy = Math.round((y || 0) * dpr);

      await chrome.debugger.detach(cdpTarget).catch(() => {});
      await withTimeout(chrome.debugger.attach(cdpTarget, "1.3"), 5000, "debugger.attach");
      try {
        const base = { x: sx, y: sy, button, clickCount, modifiers: 0 };
        await chrome.debugger.sendCommand(cdpTarget, "Input.dispatchMouseEvent", { type: "mouseMoved", ...base, button: "none", clickCount: 0 });
        if (action !== "mouse_move") {
          await chrome.debugger.sendCommand(cdpTarget, "Input.dispatchMouseEvent", { type: "mousePressed", ...base });
          if (action === "double_click") {
            await chrome.debugger.sendCommand(cdpTarget, "Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
            await chrome.debugger.sendCommand(cdpTarget, "Input.dispatchMouseEvent", { type: "mousePressed", ...base });
          }
          await chrome.debugger.sendCommand(cdpTarget, "Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
        }
      } finally {
        await chrome.debugger.detach(cdpTarget).catch(() => {});
      }

      const dataUrl = await captureWithDebugger(tab.id);
      return {
        content: [
          { type: "text", text: `${action} at (${x}, ${y})` },
          { type: "image", data: dataUrl.split(",")[1], mimeType: "image/jpeg" }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── Helper: Capture ARIA snapshot ───
async function captureAriaSnapshot(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      function getRole(el) {
        const explicit = el.getAttribute("role");
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        const type = (el.type || "").toLowerCase();
        if (tag === "a" && el.href) return "link";
        if (tag === "button") return "button";
        if (tag === "input") {
          return { checkbox: "checkbox", radio: "radio", range: "slider", number: "spinbutton", search: "searchbox", submit: "button", reset: "button", button: "button" }[type] || "textbox";
        }
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "option") return "option";
        if (/^h[1-6]$/.test(tag)) return "heading";
        if (tag === "nav") return "navigation";
        if (tag === "main") return "main";
        if (tag === "form") return "form";
        if (tag === "img") return "img";
        if (tag === "ul" || tag === "ol") return "list";
        if (tag === "li") return "listitem";
        if (tag === "dialog") return "dialog";
        if (tag === "details") return "group";
        if (tag === "summary") return "button";
        if (tag === "table") return "table";
        if (tag === "th") return "columnheader";
        if (tag === "td") return "cell";
        return null;
      }

      function getName(el) {
        const label = el.getAttribute("aria-label");
        if (label) return label.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          const ref = document.getElementById(labelledBy);
          if (ref) return ref.textContent.trim();
        }
        if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
        if (el.tagName.toLowerCase() === "img") return el.alt || "";
        const placeholder = el.getAttribute("placeholder");
        if (placeholder) return placeholder;
        const title = el.getAttribute("title");
        if (title) return title;
        if (el.children.length === 0) return (el.textContent || "").trim().substring(0, 80);
        return "";
      }

      function getStates(el) {
        const s = [];
        const tag = el.tagName.toLowerCase();
        if (el.disabled) s.push("disabled");
        if (el.required) s.push("required");
        if (el.readOnly) s.push("readonly");
        if (el.type === "checkbox" || el.type === "radio") s.push(el.checked ? "checked" : "unchecked");
        const expanded = el.getAttribute("aria-expanded");
        if (expanded !== null) s.push(expanded === "true" ? "expanded" : "collapsed");
        const ariaChecked = el.getAttribute("aria-checked");
        if (ariaChecked !== null) s.push(ariaChecked === "true" ? "checked" : "unchecked");
        if (el.getAttribute("aria-selected") === "true" || el.selected) s.push("selected");
        if (["input", "textarea"].includes(tag) && !["button", "submit", "reset", "file", "image"].includes(el.type) && el.value) {
          s.push(`value="${el.value.substring(0, 40)}"`);
        }
        const hm = tag.match(/^h([1-6])$/);
        if (hm) s.push(`level=${hm[1]}`);

        const rect = el.getBoundingClientRect();
        const isInViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
          rect.width > 0 &&
          rect.height > 0
        );
        s.push(`isInViewport=${isInViewport}`);

        return s;
      }

      const ROLES = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "option", "listbox", "slider", "spinbutton", "heading", "navigation", "main", "form", "img", "list", "listitem", "table", "row", "cell", "columnheader", "dialog", "group", "alert", "status", "tab", "tablist", "tabpanel", "menu", "menuitem", "toolbar", "tree", "treeitem"]);

      const lines = [`- document "${document.title}"`];

      function walk(el, depth) {
        if (depth > 10) return;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || el.getAttribute("aria-hidden") === "true") return;
        const role = getRole(el);
        if (role && ROLES.has(role)) {
          const name = getName(el);
          const states = getStates(el);
          let line = "  ".repeat(depth) + `- ${role}`;
          if (name) line += ` "${name.substring(0, 100)}"`;
          if (states.length) line += ` [${states.join(", ")}]`;
          lines.push(line);
          for (const c of el.children) walk(c, depth + 1);
        } else {
          for (const c of el.children) walk(c, depth);
        }
      }

      for (const c of document.body.children) walk(c, 1);
      return lines.join("\n");
    }
  });
  return results[0]?.result || "(empty page)";
}

// ─── Helper: Wait for tab load ───
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, change) => {
      if (id === tabId && change.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 10000);
  });
}

// ─── WebSocket MCP Server (via offscreen document) ───
async function ensureOffscreenDocument() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) return;

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"],
      justification: "Persistent WebSocket client for MCP browser control relay"
    });
  } catch (e) {
    // Offscreen creation races can throw if another start just created it.
    if (e.message && e.message.includes("existing")) return;
    throw e;
  }
}

async function startServer() {
  try {
    await ensureOffscreenDocument();
    isRunning = true;
    await chrome.storage.local.set({ mcpRunning: true, mcpPort: MCP_PORT });

    // Give the offscreen document a tiny moment to register its listener.
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "START_MCP_SERVER", port: MCP_PORT });
    }, 100);
  } catch (e) {
    console.error("[Browser MCP X] Failed to start:", e);
    chrome.runtime.sendMessage({ type: "START_ERROR", error: e.message || String(e) });
  }
}

async function stopServer() {
  if (!isRunning) return;

  chrome.runtime.sendMessage({ type: "STOP_MCP_SERVER" });

  try {
    const clients = await chrome.offscreen.hasDocument();
    if (clients) await chrome.offscreen.closeDocument();
  } catch (e) {}

  isRunning = false;
  connectedAgent = null;
  wsClients.clear();
  chrome.storage.local.set({ mcpRunning: false, mcpPort: null, agentConnected: false });
  clearAllAgentFrames();
}

// ─── Message routing: offscreen ↔ background ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MCP_REQUEST") {
    handleMcpRequest(msg.data).then(response => {
      if (response) {
        sendResponse(response);
      }
    }).catch(err => {
      sendResponse({ jsonrpc: "2.0", id: msg.data?.id, error: { code: -32603, message: err.message } });
    });
    return true; // async
  }

  if (msg.type === "CLIENT_CONNECTED") {
    isRunning = true;
    connectedAgent = msg.clientId;
    wsClients.add(msg.clientId);
    chrome.storage.local.set({ mcpRunning: true, agentConnected: true });
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#52B788" });
    restoreAgentContext();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "CLIENT_DISCONNECTED") {
    wsClients.delete(msg.clientId);
    if (wsClients.size === 0) {
      connectedAgent = null;
      chrome.storage.local.set({ agentConnected: false });
      chrome.action.setBadgeText({ text: isRunning ? "RDY" : "" });
    }
    persistAgentContext();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "GET_STATUS") {
    Promise.all([
      chrome.storage.local.get(["mcpRunning", "agentConnected"]),
      chrome.offscreen.hasDocument().catch(() => false)
    ]).then(([stored, hasOffscreen]) => {
      const running = Boolean(isRunning || stored.mcpRunning || stored.agentConnected || hasOffscreen);
      sendResponse({ running, port: MCP_PORT, clients: wsClients.size || (stored.agentConnected ? 1 : 0), hasOffscreen });
    });
    return true;
  }

  if (msg.type === "START_SERVER") {
    startServer().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "STOP_SERVER") {
    stopServer().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "RECORDING_ACTION") {
    if (recordingState.isRecording) {
      recordingState.actions.push(msg.action);
    }
    sendResponse({ ok: true });
    return false;
  }

});

// ─── Extension install ───
chrome.runtime.onInstalled.addListener(async (details) => {
  await restoreAgentContext();
  await startServer().catch(() => {});
  console.log(`[Browser MCP X] Extension ${details.reason}. MCP server auto-started.`);
});

// Restore running state when Chrome wakes/restarts the MV3 service worker.
chrome.runtime.onStartup.addListener(async () => {
  await restoreAgentContext();
  await startServer().catch(() => {});
});

// Auto-start on worker load
startServer().catch(() => {});

chrome.runtime.onSuspend.addListener(() => {
  // Do not stop the offscreen document here. It owns the persistent WebSocket.
  console.log("[Browser MCP X] Service worker suspended; offscreen stays active.");
});

// ─── Agent frame: soft gradient rim on tabs the agent has touched ───
async function showAgentFrame(tabId) {
  if (!tabId) return;
  const isNew = !activeManipulatedTabIds.has(tabId);
  activeManipulatedTabIds.add(tabId);
  if (isNew) persistAgentContext();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith("http")) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectAgentFrame
    }).catch(() => {});
  } catch (e) {}
}

async function updateAgentFrame(tabId) {
  if (!tabId) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith("http")) return;

    if (activeManipulatedTabIds.has(tabId)) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: injectAgentFrame
      }).catch(() => {});
    } else {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: removeAgentFrame
      }).catch(() => {});
    }
  } catch (e) {
    // Ignore restricted/system tabs
  }
}

function injectAgentFrame() {
  if (!document.getElementById("browser-mcp-agent-frame")) {
    const style = document.createElement("style");
    style.id = "browser-mcp-agent-frame-styles";
    style.textContent = `
    #browser-mcp-agent-frame {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      user-select: none;
      box-shadow:
        inset 0 0 24px 8px rgba(244, 114, 182, 0.35),
        inset 0 0 48px 16px rgba(167, 139, 250, 0.12);
    }
    #browser-mcp-agent-frame::before {
      content: "";
      position: absolute;
      inset: 0;
      padding: 5px;
      background: linear-gradient(
        135deg,
        rgba(244, 114, 182, 0.75),
        rgba(167, 139, 250, 0.35),
        rgba(225, 29, 72, 0.65),
        rgba(244, 114, 182, 0.45),
        rgba(167, 139, 250, 0.7)
      );
      background-size: 300% 300%;
      animation: browser-mcp-frame-shift 8s ease infinite;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      mask-composite: exclude;
    }
    @keyframes browser-mcp-frame-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `;

    const frame = document.createElement("div");
    frame.id = "browser-mcp-agent-frame";
    frame.setAttribute("aria-hidden", "true");

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(frame);
  }

  ensureAgentFaviconBadgeWatcher();

  function ensureAgentFaviconBadgeWatcher() {
    const root = document.documentElement;
    if (root.__browserMcpFaviconObserver) return;

    ensureAgentFaviconBadge();

    const observer = new MutationObserver(() => {
      const managed = document.getElementById("browser-mcp-agent-favicon");
      const icons = document.querySelectorAll(
        "link[rel~='icon'], link[rel='shortcut icon']"
      );
      const lastIcon = icons.length ? icons[icons.length - 1] : null;
      if (!managed || lastIcon !== managed) {
        ensureAgentFaviconBadge();
      }
    });

    if (document.head) {
      observer.observe(document.head, {
        childList: true,
        attributes: true,
        subtree: true
      });
      root.__browserMcpFaviconObserver = observer;
    }
  }

  function ensureAgentFaviconBadge() {
    const root = document.documentElement;
    const existingIcon = document.querySelector(
      "link[rel~='icon'], link[rel='shortcut icon']"
    );
    const originalHref =
      root.dataset.browserMcpOriginalFavicon ||
      (existingIcon?.id === "browser-mcp-agent-favicon"
        ? null
        : existingIcon?.href) ||
      new URL("/favicon.ico", location.href).href;
    if (originalHref) {
      root.dataset.browserMcpOriginalFavicon = originalHref;
    }

    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const paintBadge = (drewBase) => {
      const c = canvas.getContext("2d");
      c.clearRect(0, 0, size, size);
      if (!drewBase) {
        c.fillStyle = "#e8e8e8";
        c.fillRect(0, 0, size, size);
      }
      const r = size * 0.32;
      const cx = size - r - 1;
      const cy = size - r - 1;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = "#f472b6";
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "#ffffff";
      c.stroke();

      let link = document.getElementById("browser-mcp-agent-favicon");
      if (!link) {
        link = document.createElement("link");
        link.id = "browser-mcp-agent-favicon";
        link.rel = "icon";
      }
      link.href = canvas.toDataURL("image/png");
      document.head.appendChild(link);
      root.dataset.browserMcpFaviconBadged = "1";
    };

    const img = new Image();
    img.referrerPolicy = "no-referrer";
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        if (ok) {
          const c = canvas.getContext("2d");
          c.clearRect(0, 0, size, size);
          c.drawImage(img, 0, 0, size, size);
          paintBadge(true);
        } else {
          paintBadge(false);
        }
      } catch (_) {
        try {
          paintBadge(false);
        } catch (e) {
          // Ignore restricted pages
        }
      }
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    try {
      img.crossOrigin = "anonymous";
      img.src = originalHref || new URL("/favicon.ico", location.href).href;
    } catch (_) {
      done(false);
    }
    setTimeout(() => done(false), 1500);
  }
}

function removeAgentFrame() {
  document.getElementById("browser-mcp-agent-frame")?.remove();
  document.getElementById("browser-mcp-agent-frame-styles")?.remove();
  document.getElementById("browser-mcp-active-badge")?.remove();
  document.getElementById("browser-mcp-badge-styles")?.remove();

  const root = document.documentElement;
  root.__browserMcpFaviconObserver?.disconnect();
  delete root.__browserMcpFaviconObserver;
  const managed = document.getElementById("browser-mcp-agent-favicon");
  const original = root.dataset.browserMcpOriginalFavicon;
  managed?.remove();
  if (original) {
    let link = document.querySelector(
      "link[rel~='icon'], link[rel='shortcut icon']"
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = original;
  }
  delete root.dataset.browserMcpOriginalFavicon;
  delete root.dataset.browserMcpFaviconBadged;
}

async function clearAllAgentFrames() {
  const activeIds = Array.from(activeManipulatedTabIds);
  activeManipulatedTabIds.clear();
  persistAgentContext();
  for (const tabId of activeIds) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: removeAgentFrame
      }).catch(() => {});
    } catch (e) {}
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    updateAgentFrame(tabId);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateAgentFrame(activeInfo.tabId);
});