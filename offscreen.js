// ═══════════════════════════════════════════════════════════
// BrowserMCP — Offscreen Document
// Connects TO the relay (relay.py) via WebSocket as a client
// Relay runs at ws://localhost:9274
// ═══════════════════════════════════════════════════════════

let ws = null;
// Use explicit IPv4 loopback. Some Chrome/offscreen contexts resolve
// localhost inconsistently (IPv6 ::1 vs 127.0.0.1), while relay.py
// binds to 127.0.0.1.
const RELAY_WS_URL = "ws://127.0.0.1:9274";
let connected = false;

async function captureWithDebugger(tabId) {
  const target = { tabId };
  let attached = false;
  const capture = async () => {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const result = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", { format: "png" });
    return `data:image/png;base64,${result.data}`;
  };
  try {
    return await Promise.race([
      capture(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Debugger screenshot timed out after 25s")), 25000))
    ]);
  } finally {
    if (attached) chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_MCP_SERVER") {
    connectToRelay();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "STOP_MCP_SERVER") {
    if (ws) { ws.close(); ws = null; }
    connected = false;
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "TAKE_SCREENSHOT") {
    captureWithDebugger(msg.tabId)
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }
});

function connectToRelay() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(RELAY_WS_URL);

    ws.onopen = () => {
      console.log("[BrowserMCP] Connected to relay");
      connected = true;
      chrome.runtime.sendMessage({ type: "CLIENT_CONNECTED", clientId: "extension" });
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Forward MCP request to background script
        chrome.runtime.sendMessage({ type: "MCP_REQUEST", data: msg }, (response) => {
          if (response && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
          }
        });
      } catch (e) {
        console.error("[BrowserMCP] Parse error:", e);
      }
    };

    ws.onclose = () => {
      console.log("[BrowserMCP] Disconnected from relay. Reconnecting in 2s...");
      connected = false;
      chrome.runtime.sendMessage({ type: "CLIENT_DISCONNECTED", clientId: "extension" });
      // Auto-reconnect with exponential backoff
      let retryDelay = 2000;
      const maxDelay = 30000;
      const retry = () => {
        chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
          if (status?.running) {
            setTimeout(() => connectToRelay(), Math.min(retryDelay, maxDelay));
            retryDelay = Math.min(retryDelay * 1.5, maxDelay);
          }
        });
      };
      retry();
    };

    ws.onerror = (err) => {
      console.error("[BrowserMCP] WS error:", err);
    };
  } catch (e) {
    console.error("[BrowserMCP] Connection failed:", e);
    setTimeout(connectToRelay, 3000);
  }
}