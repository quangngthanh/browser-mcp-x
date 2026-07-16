# Agent Tab Favicon Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a green dot on the Chrome tab-strip favicon for every tab the agent has manipulated, restoring the original favicon when marks are cleared.

**Architecture:** Extend the existing page-injected `injectAgentFrame` / `removeAgentFrame` pair in `background.js` so the same `chrome.scripting.executeScript` call that draws the green page rim also composites a `#52B788` badge onto the tab favicon (canvas → managed `<link rel="icon">`). Lifecycle stays tied to `activeManipulatedTabIds`, `showAgentFrame`, `updateAgentFrame`, and `clearAllAgentFrames`.

**Tech Stack:** Chrome MV3 extension, vanilla JS in `background.js` (service worker + injected page functions), Canvas 2D, no new dependencies or permissions.

## Global Constraints

- Always on — no popup toggle, no `chrome.storage` preference for this feature.
- No Tab Groups, no `document.title` changes.
- Only `http(s)` tabs (same guard as agent frame).
- Accent color `#52B788`; badge bottom-right on 32×32 canvas; thin light stroke.
- Keep page overlay behavior unchanged.
- Prefer in-place edits to `background.js`; do not add a test framework or new packages (repo is zero-deps).
- Functions should stay focused; keep inject helpers under ~100 lines each (split helpers if needed).

## File map

| File | Role |
|------|------|
| `background.js` | Add favicon badge apply/restore helpers; call them from `injectAgentFrame` / `removeAgentFrame` |
| `docs/superpowers/specs/2026-07-16-agent-tab-favicon-badge-design.md` | Spec (read-only reference) |

---

### Task 1: Favicon badge apply + restore in agent frame injectors

**Files:**
- Modify: `background.js` (`injectAgentFrame`, `removeAgentFrame`, plus new helper functions defined next to them)

**Interfaces:**
- Consumes: existing `injectAgentFrame` / `removeAgentFrame` injection via `showAgentFrame` / `updateAgentFrame` / `clearAllAgentFrames`
- Produces:
  - `getAgentFaviconHref()` → `string` (current icon URL or `/favicon.ico` absolute)
  - `drawAgentFaviconBadge(baseHref)` → `Promise<string>` (data URL)
  - `applyAgentFaviconBadge()` → `void` (async work fire-and-forget inside page)
  - `restoreAgentFaviconBadge()` → `void`
  - Markers: `document.documentElement.dataset.browserMcpOriginalFavicon`, `#browser-mcp-agent-favicon`

- [ ] **Step 1: Read current inject block**

Open `background.js` around the `// ─── Agent frame` section (~line 1593). Confirm `injectAgentFrame` early-returns when `#browser-mcp-agent-frame` exists, and `removeAgentFrame` removes frame + legacy badge nodes.

- [ ] **Step 2: Add page-side favicon helpers above `injectAgentFrame`**

Insert these functions in `background.js` immediately before `function injectAgentFrame()` (they must be serializable / self-contained because only `injectAgentFrame` / `removeAgentFrame` are passed to `executeScript` — **put the helper logic inside those two functions**, or define nested functions inside them). Preferred shape: nest helpers inside `injectAgentFrame` / call restore logic inside `removeAgentFrame` so no extra `executeScript` targets are needed.

Inside `injectAgentFrame`, after the existing early-return for the frame **is adjusted** (see Step 3), add badge apply:

```javascript
function injectAgentFrame() {
  // --- page overlay (existing) ---
  if (!document.getElementById("browser-mcp-agent-frame")) {
    const style = document.createElement("style");
    style.id = "browser-mcp-agent-frame-styles";
    style.textContent = `/* keep existing CSS unchanged */`;
    const frame = document.createElement("div");
    frame.id = "browser-mcp-agent-frame";
    frame.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(frame);
  }

  // --- favicon badge ---
  applyAgentFaviconBadge();

  function applyAgentFaviconBadge() {
    const root = document.documentElement;
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
      const r = size * 0.16;
      const cx = size - r - 2;
      const cy = size - r - 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#52B788";
      ctx.fill();
      ctx.lineWidth = 1.5;
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
    // If cached sync-complete never fires in edge cases, fallback:
    setTimeout(() => done(false), 1500);
  }
}
```

Keep the **existing** `style.textContent` CSS string exactly as it is today (do not rewrite the gradient rim).

**Important early-return change:** Today `injectAgentFrame` returns immediately if the frame exists, which would skip favicon re-apply after a site resets the icon without removing the frame. Change to:

1. Create frame only if missing (as above).
2. Always call `applyAgentFaviconBadge()` (idempotent via `dataset.browserMcpFaviconBadged` + managed link). On full navigation, the document is new so dataset is empty and badge reapplies — covered by `onUpdated` → `updateAgentFrame`.

For **reload after navigation**, badge must re-apply even when frame was just recreated — the code above does that.

If the site later replaces favicons while the frame stays mounted, v1 accepts stale badge until next `complete` or next `showAgentFrame` (spec: MutationObserver out of scope). To allow re-apply after `onUpdated` on same document without navigation, clear the badged flag is unnecessary on full load. Optional: in `applyAgentFaviconBadge`, if managed link is missing, clear `browserMcpFaviconBadged` and redraw from `browserMcpOriginalFavicon`. Implement that:

```javascript
if (root.dataset.browserMcpFaviconBadged === "1" &&
    !document.getElementById("browser-mcp-agent-favicon")) {
  delete root.dataset.browserMcpFaviconBadged;
}
if (root.dataset.browserMcpFaviconBadged === "1" &&
    document.getElementById("browser-mcp-agent-favicon")) {
  return;
}
```

- [ ] **Step 3: Extend `removeAgentFrame` to restore favicon**

Replace `removeAgentFrame` with:

```javascript
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
```

No changes to `showAgentFrame`, `updateAgentFrame`, `clearAllAgentFrames`, or tab listeners — they already inject/remove these functions.

- [ ] **Step 4: Manual syntax check**

Run:

```bash
node --check background.js
```

Expected: exit code `0`, no output.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "$(cat <<'EOF'
Add green favicon badge on agent-manipulated tabs.

EOF
)"
```

---

### Task 2: Manual verification in Chrome

**Files:**
- None (reload unpacked extension only)

**Interfaces:**
- Consumes: Task 1 inject/restore behavior
- Produces: Confirmed checklist results (no code)

- [ ] **Step 1: Reload extension**

In `chrome://extensions`, click Reload on BrowserMCP. Ensure the service worker starts (popup Start if needed).

- [ ] **Step 2: Mark a tab**

Open any `https://` site with a visible favicon (e.g. `https://example.com`). Trigger any agent tool that calls `showAgentFrame` (navigate / click / snapshot via MCP).

Expected:
- Green page rim still visible.
- Tab strip favicon shows original icon with a small green dot bottom-right (or gray base + green dot if favicon CORS blocks compositing).

- [ ] **Step 3: Reload marked tab**

Refresh the tab.

Expected: After load completes, green rim returns and favicon badge returns.

- [ ] **Step 4: Clear marks**

Stop the MCP server from the popup (path that calls `clearAllAgentFrames`), or otherwise clear agent frames.

Expected: Page rim gone; favicon restored to pre-badge look (no green dot).

- [ ] **Step 5: Unmarked tab sanity**

Activate a tab the agent never touched.

Expected: No green rim; favicon unchanged.

- [ ] **Step 6: Commit only if Step 2–5 forced a fix**

If verification found a bug, fix in `background.js`, re-run `node --check background.js`, then:

```bash
git add background.js
git commit -m "$(cat <<'EOF'
Fix agent favicon badge edge cases from manual verification.

EOF
)"
```

If no fixes needed, skip this commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Badge on agent-manipulated tabs | Task 1 |
| Restore on clear / remove | Task 1 `removeAgentFrame` |
| Re-apply on `onUpdated` complete | Existing listener + Task 1 idempotent apply |
| Keep page overlay | Task 1 preserves frame CSS |
| Always on / no toggle | Global Constraints + no popup work |
| `#52B788`, bottom-right, stroke | Task 1 canvas draw |
| CORS / load failure fallback | Task 1 `finish(false)` gray base |
| No Tab Groups / title | Not implemented |
| http(s) only | Existing guards unchanged |

**Placeholder scan:** none.  
**Type consistency:** markers `browserMcpOriginalFavicon` / `browserMcpFaviconBadged` / `#browser-mcp-agent-favicon` used consistently in apply + restore.
