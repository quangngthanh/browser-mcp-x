// ═══════════════════════════════════════════════════════════
// Browser MCP X — Offscreen Document
// Connects TO the relay (relay.py) via WebSocket as a client
// Relay runs at ws://localhost:9274
// ═══════════════════════════════════════════════════════════

let ws = null;
// Use explicit IPv4 loopback. Some Chrome/offscreen contexts resolve
// localhost inconsistently (IPv6 ::1 vs 127.0.0.1), while relay.py
// binds to 127.0.0.1.
const RELAY_WS_URL = "ws://127.0.0.1:9274";
const RECONNECT_MS = 3000;
const STANDBY_RETRY_MS = 5000;
const CLOSE_BUSY = 4001;
const CLOSE_TAKEN_OVER = 4002;

let config = null;
let wantConnected = false;
let reconnectTimer = null;
let inStandby = false;
let standbyBrowser = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_MCP_SERVER") {
    const renamed = config && config.name !== msg.browserName;
    config = { id: msg.instanceId, name: msg.browserName };
    wantConnected = true;
    if (msg.takeover || (renamed && ws?.readyState === WebSocket.OPEN)) {
      reconnectNow(Boolean(msg.takeover));
    } else {
      connectToRelay(false);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "STOP_MCP_SERVER") {
    wantConnected = false;
    clearTimeout(reconnectTimer);
    if (ws) { ws.close(); ws = null; }
    sendResponse({ ok: true });
    return false;
  }
});

chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(() => {});

function reconnectNow(takeover) {
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  connectToRelay(takeover);
}

function scheduleReconnect(delay = RECONNECT_MS) {
  clearTimeout(reconnectTimer);
  if (wantConnected) reconnectTimer = setTimeout(() => connectToRelay(false), delay);
}

function connectToRelay(takeover) {
  if (!wantConnected || !config) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const params = new URLSearchParams({ id: config.id, name: config.name, takeover: takeover ? "1" : "0" });

  try {
    const socket = new WebSocket(`${RELAY_WS_URL}/?${params}`);
    ws = socket;
    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === "notifications/relay_accepted") {
          inStandby = false;
          standbyBrowser = null;
          chrome.runtime.sendMessage({ type: "CLIENT_CONNECTED", clientId: "extension" });
          return;
        }
        chrome.runtime.sendMessage({ type: "MCP_REQUEST", data: msg }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[Browser MCP X] sendMessage callback error:", chrome.runtime.lastError.message);
            return;
          }
          if (response && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(response));
          }
        });
      } catch (e) {
        console.error("[Browser MCP X] Parse error:", e);
      }
    };

    socket.onclose = (event) => {
      if (ws === socket) ws = null;

      if (event.code === CLOSE_BUSY) {
        if (!inStandby || standbyBrowser !== event.reason) {
          inStandby = true;
          standbyBrowser = event.reason;
          chrome.runtime.sendMessage({ type: "RELAY_STANDBY", activeBrowser: event.reason });
        }
        scheduleReconnect(STANDBY_RETRY_MS);
        return;
      }

      inStandby = false;
      standbyBrowser = null;

      if (event.code === CLOSE_TAKEN_OVER) {
        wantConnected = false;
        chrome.runtime.sendMessage({ type: "RELAY_TAKEN_OVER", activeBrowser: event.reason });
        return;
      }

      chrome.runtime.sendMessage({ type: "CLIENT_DISCONNECTED", clientId: "extension" });
      scheduleReconnect();
    };

    socket.onerror = () => {};
  } catch (e) {
    console.error("[Browser MCP X] Connection failed:", e);
    scheduleReconnect();
  }
}
