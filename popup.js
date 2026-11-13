// ═══════════════════════════════════════════════════════════
// Browser MCP X — Popup Script
// ═══════════════════════════════════════════════════════════

let isRunning = false;

function refreshStatus() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
    if (!status) return;
    isRunning = status.running;
    updateUI(status);
    const nameInput = document.getElementById("browserName");
    if (nameInput && document.activeElement !== nameInput) nameInput.value = status.browserName || "";
  });
}

refreshStatus();

chrome.runtime.onMessage.addListener((msg) => {
  if (["CLIENT_CONNECTED", "CLIENT_DISCONNECTED", "RELAY_STANDBY", "RELAY_TAKEN_OVER"].includes(msg.type)) {
    setTimeout(refreshStatus, 150);
  }
});

function toggleServer() {
  const type = isRunning ? "STOP_SERVER" : "START_SERVER";
  chrome.runtime.sendMessage({ type }, () => refreshStatus());
}

function takeOver() {
  chrome.runtime.sendMessage({ type: "TAKE_OVER" }, () => setTimeout(refreshStatus, 500));
}

function saveBrowserName() {
  const input = document.getElementById("browserName");
  const browserName = input.value.trim();
  if (!browserName) {
    refreshStatus();
    return;
  }
  chrome.runtime.sendMessage({ type: "SET_BROWSER_NAME", browserName }, () => {
    if (isRunning) chrome.runtime.sendMessage({ type: "START_SERVER" }, () => refreshStatus());
  });
}

function updateUI(status = {}) {
  const btn = document.getElementById("startBtn");
  const takeoverBtn = document.getElementById("takeoverBtn");
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const ws = document.getElementById("wsStatus");
  const note = document.getElementById("relayNote");
  const state = status.relayState;
  const other = status.activeBrowser ? `"${status.activeBrowser}"` : "another browser";

  btn.textContent = isRunning ? "Stop" : "Start";
  btn.className = isRunning ? "btn btn-danger" : "btn btn-primary";
  ws.textContent = isRunning ? "ws://localhost:9274" : "—";
  ws.style.color = isRunning ? "#f472b6" : "#a291b5";

  note.hidden = true;
  takeoverBtn.hidden = true;

  if (!isRunning) {
    dot.className = "status-dot dot-off";
    text.textContent = "Stopped";
    if (state === "taken_over") {
      note.textContent = `Agent control moved to ${other}. This browser will not reconnect until you start it again.`;
      note.hidden = false;
      takeoverBtn.hidden = false;
    }
    return;
  }

  if (state === "standby") {
    dot.className = "status-dot dot-waiting";
    text.textContent = "Standby";
    note.textContent = `Agent is controlling ${other}. This browser takes over only when that one stops, or when you click below.`;
    note.hidden = false;
    takeoverBtn.hidden = false;
    return;
  }

  const active = state === "active" || status.clients > 0;
  dot.className = active ? "status-dot dot-on" : "status-dot dot-waiting";
  text.textContent = active ? "Active" : "Connecting";
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startBtn").addEventListener("click", toggleServer);
  document.getElementById("takeoverBtn").addEventListener("click", takeOver);
  const nameInput = document.getElementById("browserName");
  nameInput.addEventListener("change", saveBrowserName);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
  });
});
