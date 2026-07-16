// ═══════════════════════════════════════════════════════════
// BrowserMCP — Background Service Worker
// Zero-setup MCP server running inside the extension
// AI agents connect via WebSocket to localhost:9275
// ═══════════════════════════════════════════════════════════

const MCP_PORT = 9275;
const MCP_VERSION = "0.4.0";
let wsServer = null;
let wsClients = new Set();
let isRunning = false;
let connectedAgent = null;

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
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["jpeg", "png"], default: "jpeg" },
        quality: { type: "number", description: "JPEG quality 0-100 (ignored for png)", default: 75 }
      }
    }
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
    description: "Type text into an input field identified by CSS selector",
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
    description: "Run JavaScript in the active tab and return the result",
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
    description: "Simulate pressing a keyboard key (e.g. 'Enter', 'Tab', 'Escape')",
    inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] }
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
    description: "Create a new tab with an optional URL",
    inputSchema: { type: "object", properties: { url: { type: "string" }, active: { type: "boolean", default: true } } }
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
    description: "Capture recent network requests from the active tab (URL, method, status, type)",
    inputSchema: { type: "object", properties: { filter: { type: "string", default: "" } } }
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
  }
];

// ─── Agent Tab Lock ───
// Persisted to chrome.storage.local so the agent resumes on its last tab
// after reconnect or service-worker restart — not wherever the user happens to be.
let agentTargetTabId = null;
let activeManipulatedTabIds = new Set();

function persistAgentContext() {
  chrome.storage.local.set({
    agentTargetTabId,
    activeManipulatedTabIds: Array.from(activeManipulatedTabIds)
  });
}

async function restoreAgentContext() {
  const stored = await chrome.storage.local.get(["agentTargetTabId", "activeManipulatedTabIds"]);
  if (stored.agentTargetTabId != null) {
    try {
      await chrome.tabs.get(stored.agentTargetTabId);
      agentTargetTabId = stored.agentTargetTabId;
    } catch (e) {
      agentTargetTabId = null;
    }
  }
  if (Array.isArray(stored.activeManipulatedTabIds)) {
    for (const id of stored.activeManipulatedTabIds) {
      try {
        await chrome.tabs.get(id);
        activeManipulatedTabIds.add(id);
      } catch (e) { /* tab gone */ }
    }
  }
  persistAgentContext();
}

async function getAgentTab() {
  if (agentTargetTabId !== null) {
    try {
      return await chrome.tabs.get(agentTargetTabId);
    } catch (e) {
      agentTargetTabId = null;
      persistAgentContext();
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    agentTargetTabId = tab.id;
    persistAgentContext();
  }
  return tab;
}

// ─── Recording State ───
let recordingState = { isRecording: false, actions: [], recordingTabId: null };

// ─── Network/Console Capture State ───
let consoleLogs = [];
let networkRequests = [];

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
          serverInfo: { name: "browser-mcp", version: MCP_VERSION }
        };
        break;

      case "tools/list":
        result = { tools: MCP_TOOLS };
        break;

      case "tools/call":
        result = await executeTool(params.name, params.arguments || {});
        break;

      case "notifications/initialized":
        return null; // No response for notifications

      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }

    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    console.error(`[BrowserMCP] Error handling ${method}:`, error);
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
async function executeTool(toolName, args) {
  const tab = await getAgentTab();
  if (!tab && !["get_tabs", "switch_tab", "close_tab"].includes(toolName)) {
    throw new Error("No active tab found");
  }

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
      const format = args.format === "png" ? "png" : "jpeg";
      const quality = typeof args.quality === "number" ? args.quality : 75;
      try {
        const dataUrl = await captureWithDebugger(tab.id, format, quality);
        return {
          content: [
            { type: "text", text: "Screenshot captured" },
            { type: "image", data: dataUrl.split(",")[1], mimeType: `image/${format}` }
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
            let indent = "  ".repeat(depth);
            let line = `${indent}<${tag}`;
            if (id) line += ` #${id}`;
            if (cls) line += ` .${String(cls).substring(0, 40)}`;
            if (role) line += ` [${role}]`;
            if (aria) line += ` "${aria}"`;
            if (href) line += ` href="${href.substring(0, 60)}"`;
            if (name) line += ` name="${name}"`;
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
          el.scrollIntoView({ behavior: "instant", block: "center" });
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
          el.focus();
          el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          // Also dispatch a keyboard input event for React-controlled inputs.
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
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (targetText) => {
          const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
          const needle = normalize(targetText);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
          let el;
          while ((el = walker.nextNode())) {
            if (el.children.length > 0) continue; // only leaf-ish elements
            const text = normalize(el.textContent || "");
            if (text === needle || text.includes(needle)) {
              el.scrollIntoView({ behavior: "instant", block: "center" });
              const rect = el.getBoundingClientRect();
              const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
              el.dispatchEvent(new PointerEvent("pointerdown", opts));
              el.dispatchEvent(new MouseEvent("mousedown", opts));
              el.dispatchEvent(new PointerEvent("pointerup", opts));
              el.dispatchEvent(new MouseEvent("mouseup", opts));
              el.dispatchEvent(new MouseEvent("click", opts));
              if (typeof el.click === "function") el.click();
              return `Clicked text: "${targetText}"`;
            }
          }
          return `No element found with text: "${targetText}"`;
        },
        args: [args.text]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
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
      const tabList = tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
      return { content: [{ type: "text", text: JSON.stringify(tabList, null, 2) }] };
    }

    case "switch_tab": {
      const targetTabId = args.tabId ?? args.id;
      if (targetTabId == null) {
        return { content: [{ type: "text", text: "Error: missing tabId or id argument" }] };
      }
      await chrome.tabs.update(targetTabId, { active: true });
      agentTargetTabId = targetTabId;
      persistAgentContext();
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
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (script) => {
          try {
            // Use Function constructor instead of eval — bypasses CSP 'unsafe-eval'
            const fn = new Function("return (" + script + ")");
            return String(fn());
          } catch(e) {
            // Try as expression if Function fails
            try {
              const fn2 = new Function(script);
              return String(fn2());
            } catch(e2) {
              return `Error: ${e2.message}`;
            }
          }
        },
        args: [args.script],
        world: "MAIN"
      });
      return { content: [{ type: "text", text: results[0]?.result || "undefined" }] };
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
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (key) => {
          document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
          document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
          return `Pressed ${key}`;
        },
        args: [args.key]
      });
      if (recordingState.isRecording) {
        recordingState.actions.push({ type: "key", key: args.key, timestamp: Date.now() });
      }
      return { content: [{ type: "text", text: results[0]?.result }] };
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
      const newTab = await chrome.tabs.create({ url: args.url || "about:blank", active: args.active !== false });
      if (args.url) await waitForTabLoad(newTab.id);
      return { content: [{ type: "text", text: `Created tab ${newTab.id} with URL: ${args.url || "about:blank"}` }] };
    }

    case "batch_execute": {
      const steps = args.steps || [];
      const targetTabId = args.tabId || tab.id;
      const results = [];
      for (const step of steps) {
        try {
          const stepResult = await executeTool(step.tool, step.args || {});
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
      const filterStr = args.filter || "";
      // Reads recorded resource timing entries via the Performance API;
      // does not use chrome.debugger.
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (filterStr) => {
          const entries = performance.getEntriesByType("resource");
          const requests = entries.map(e => ({
            url: e.name,
            type: e.initiatorType,
            duration: Math.round(e.duration),
            size: e.transferSize || 0
          })).filter(r => !filterStr || r.url.includes(filterStr));
          return requests.slice(-50);
        },
        args: [filterStr]
      });
      return { content: [{ type: "text", text: JSON.stringify(results[0]?.result || [], null, 2) }] };
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
        func: (flt) => {
          let elements = [];
          const selectors = {
            all: "button, a[href], input, select, textarea, [role='button'], [onclick], [tabindex]",
            buttons: "button, [role='button'], input[type='submit'], input[type='button'], [onclick]",
            links: "a[href]",
            inputs: "input, select, textarea",
            forms: "form"
          };
          const els = document.querySelectorAll(selectors[flt] || selectors.all);
          els.forEach((el, idx) => {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const text = (el.textContent || el.value || el.placeholder || el.getAttribute("aria-label") || "").trim().substring(0, 60);
            const tag = el.tagName.toLowerCase();
            const type = el.type || el.getAttribute("role") || "";
            const id = el.id ? `#${el.id}` : "";
            const name = el.name ? `[name="${el.name}"]` : "";
            const cls = el.className ? `.${String(el.className).split(" ")[0]}` : "";
            const selector = id || name || (cls ? `${tag}${cls}` : `${tag}:nth-of-type(1)`);
            elements.push({
              id: idx,
              tag, type, text, selector,
              position: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
            });
          });
          return elements.slice(0, 100);
        },
        args: [filter]
      });
      return { content: [{ type: "text", text: JSON.stringify(results[0]?.result || [], null, 2) }] };
    }

    case "click_by_id": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (id) => {
          const selectors = "button, a[href], input, select, textarea, [role='button'], [onclick], [tabindex]";
          const els = document.querySelectorAll(selectors);
          let count = 0;
          for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            if (count === id) { el.click(); return `Clicked element #${id}: ${(el.textContent || el.value || "").trim().substring(0, 40)}`; }
            count++;
          }
          return `Element #${id} not found`;
        },
        args: [args.elementId]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "type_by_id": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (id, text) => {
          const selectors = "button, a[href], input, select, textarea, [role='button'], [onclick], [tabindex]";
          const els = document.querySelectorAll(selectors);
          let count = 0;
          for (const el of els) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            if (count === id) {
              el.focus();
              el.value = text;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              return `Typed "${text}" into element #${id}`;
            }
            count++;
          }
          return `Element #${id} not found`;
        },
        args: [args.elementId, args.text]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "click_text": {
      const { text, partial = true } = args;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (searchText, isPartial) => {
          // Search most specific elements first (a, button) then generic (div, span)
          const selectors = ["button", "a", "[role='button']", "input[type='submit']", "[onclick]", "label", "span", "div"];
          const searchTextLower = searchText.toLowerCase();
          let bestMatch = null;
          let bestScore = Infinity;
          for (const sel of selectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              const elText = (el.textContent || "").trim();
              if (!elText) continue;
              const match = isPartial
                ? elText.toLowerCase().includes(searchTextLower)
                : elText.toLowerCase() === searchTextLower;
              if (match) {
                // Prefer shorter text (more specific element)
                const score = elText.length;
                if (score < bestScore) {
                  bestScore = score;
                  bestMatch = el;
                }
              }
            }
            if (bestMatch && bestScore <= searchText.length + 20) break;
          }
          if (bestMatch) {
            bestMatch.click();
            return `Clicked: "${(bestMatch.textContent || "").trim().substring(0, 60)}"`;
          }
          return `No element found with text: "${searchText}"`;
        },
        args: [text, partial]
      });
      return { content: [{ type: "text", text: results[0]?.result }] };
    }

    case "hover": {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          const el = document.querySelector(sel);
          if (!el) return `Element not found: ${sel}`;
          const events = ["mouseenter", "mouseover", "mousemove", "hover"];
          for (const type of events) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          }
          el.scrollIntoView({ behavior: "smooth", block: "center" });
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
      // Chrome MV3 offscreen reasons do not include WEB_SOCKETS.
      // WORKERS is the closest valid reason for a persistent offscreen
      // context that owns the relay WebSocket client.
      reasons: ["WORKERS"],
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
    console.error("[BrowserMCP] Failed to start:", e);
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
    connectedAgent = msg.clientId;
    wsClients.add(msg.clientId);
    chrome.storage.local.set({ agentConnected: true });
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
      chrome.storage.local.get(["mcpRunning"]),
      chrome.offscreen.hasDocument().catch(() => false)
    ]).then(([stored, hasOffscreen]) => {
      const running = Boolean(isRunning || stored.mcpRunning || hasOffscreen);
      sendResponse({ running, port: MCP_PORT, clients: wsClients.size, hasOffscreen });
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
  if (details.reason === "install") {
    chrome.storage.local.set({ mcpRunning: false, mcpPort: null, agentConnected: false, autoStart: false });
  } else {
    await restoreAgentContext();
  }
  console.log(`[BrowserMCP] Extension ${details.reason}. MCP server ready to start.`);
});

// Restore running state when Chrome wakes/restarts the MV3 service worker.
// Without this, closing the popup can let Chrome suspend the worker and lose
// the in-memory `isRunning` flag, causing offscreen reconnect logic to stop.
chrome.runtime.onStartup.addListener(async () => {
  await restoreAgentContext();
  const stored = await chrome.storage.local.get(["mcpRunning"]);
  if (stored.mcpRunning) await startServer();
});

chrome.runtime.onSuspend.addListener(() => {
  // Do not stop the offscreen document here. It owns the persistent WebSocket.
  console.log("[BrowserMCP] Service worker suspended; offscreen stays active.");
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
        inset 0 0 24px 8px rgba(82, 183, 136, 0.35),
        inset 0 0 48px 16px rgba(45, 106, 79, 0.12);
    }
    #browser-mcp-agent-frame::before {
      content: "";
      position: absolute;
      inset: 0;
      padding: 5px;
      background: linear-gradient(
        135deg,
        rgba(82, 183, 136, 0.75),
        rgba(116, 198, 157, 0.35),
        rgba(45, 106, 79, 0.65),
        rgba(82, 183, 136, 0.45),
        rgba(116, 198, 157, 0.7)
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

  applyAgentFaviconBadge();

  function applyAgentFaviconBadge() {
    const root = document.documentElement;
    if (root.dataset.browserMcpFaviconBadged === "1" &&
        !document.getElementById("browser-mcp-agent-favicon")) {
      delete root.dataset.browserMcpFaviconBadged;
    }
    if (root.dataset.browserMcpFaviconBadged === "1" &&
        document.getElementById("browser-mcp-agent-favicon")) {
      return;
    }

    const existingIcon = document.querySelector(
      "link[rel~='icon'], link[rel='shortcut icon']"
    );
    const originalHref =
      root.dataset.browserMcpOriginalFavicon ||
      existingIcon?.href ||
      new URL("/favicon.ico", location.href).href;
    root.dataset.browserMcpOriginalFavicon = originalHref;

    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const finish = (drewBase) => {
      if (!drewBase) {
        ctx.fillStyle = "#e8e8e8";
        ctx.fillRect(0, 0, size, size);
      }
      const r = size * 0.32;
      const cx = size - r - 1;
      const cy = size - r - 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      // Bright mint — more visible on the tab strip than the page-rim green
      ctx.fillStyle = "#E835CA";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      let link = document.getElementById("browser-mcp-agent-favicon");
      if (!link) {
        link = document.createElement("link");
        link.id = "browser-mcp-agent-favicon";
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = canvas.toDataURL("image/png");
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
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          finish(true);
        } else {
          finish(false);
        }
      } catch (_) {
        finish(false);
      }
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    try {
      img.crossOrigin = "anonymous";
      img.src = originalHref;
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
  agentTargetTabId = null;
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