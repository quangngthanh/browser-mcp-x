// ═══════════════════════════════════════════════════════════
// Browser MCP X — Popup Script
// ═══════════════════════════════════════════════════════════

let isRunning = false;

// Check initial status
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
  if (status) {
    isRunning = status.running;
    updateUI(status);
  }
});

// Listen for status updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CLIENT_CONNECTED") {
    const dot = document.getElementById("statusDot");
    if (dot) dot.className = "status-dot dot-on";
  }
  if (msg.type === "CLIENT_DISCONNECTED") {
    const dot = document.getElementById("statusDot");
    if (dot && isRunning) dot.className = "status-dot dot-waiting";
  }
});

function toggleServer() {
  if (isRunning) {
    chrome.runtime.sendMessage({ type: "STOP_SERVER" }, () => {
      isRunning = false;
      updateUI();
    });
  } else {
    chrome.runtime.sendMessage({ type: "START_SERVER" }, () => {
      isRunning = true;
      updateUI();
    });
  }
}

function updateUI(status) {
  const btn = document.getElementById("startBtn");
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  const ws = document.getElementById("wsStatus");

  if (isRunning) {
    if (btn) {
      btn.textContent = "Stop";
      btn.className = "btn btn-danger";
    }
    if (dot) {
      dot.className = (status && status.clients > 0) ? "status-dot dot-on" : "status-dot dot-waiting";
    }
    if (text) {
      text.textContent = "Running";
    }
    if (ws) {
      ws.textContent = "ws://localhost:9274";
      ws.style.color = "#f472b6"; // neon pink
    }
  } else {
    if (btn) {
      btn.textContent = "Start";
      btn.className = "btn btn-primary";
    }
    if (dot) {
      dot.className = "status-dot dot-off";
    }
    if (text) {
      text.textContent = "Stopped";
    }
    if (ws) {
      ws.textContent = "—";
      ws.style.color = "#a291b5"; // lavender/slate-purple
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Event Listeners (CSP-safe — no inline handlers)
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("startBtn");
  if (startBtn) startBtn.addEventListener("click", toggleServer);
});
