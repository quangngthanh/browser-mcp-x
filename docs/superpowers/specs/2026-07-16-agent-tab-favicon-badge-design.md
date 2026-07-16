# Agent Tab Favicon Badge — Design

**Date:** 2026-07-16  
**Status:** Approved  
**Scope:** Mark browser tabs the agent has manipulated via a favicon badge on the Chrome tab strip.

## Problem

The extension already shows a soft green inset overlay (`#browser-mcp-agent-frame`) on pages the agent has touched. That signal is excellent while looking at the page, but invisible on the **tab strip** when many tabs are open. Users need a lightweight way to spot agent-touched tabs without leaving the current tab.

Chrome extensions cannot recolor individual tab backgrounds. Tab Groups and title prefixes were considered and rejected for disruptiveness. Favicon overlay is the chosen approach.

## Goals

- Show a clear but light marker on the **tab strip** for agent-manipulated tabs.
- Keep the existing page overlay unchanged.
- Restore the original favicon when the tab is no longer marked.
- Always on — no user toggle / popup setting.

## Non-goals

- Tab Groups / changing tab strip background color.
- Prefixing or rewriting `document.title`.
- Popup toggle or `chrome.storage` preference for this feature.
- Marking non-`http(s)` / restricted tabs (same constraint as the agent frame).

## Behavior

1. When a tab enters `activeManipulatedTabIds` (via `showAgentFrame`), apply a favicon badge on that tab.
2. When the tab is removed from the set (`clearAllAgentFrames` / `removeAgentFrame`), restore the original favicon.
3. On `chrome.tabs.onUpdated` with `status === "complete"`, re-apply the badge if the tab is still in the set (handles navigation / SPA favicon resets).
4. Page overlay injection remains as today; badge runs in the same lifecycle.

## Visual design

- Base: existing site favicon (or a neutral fallback if none / load fails).
- Overlay: solid circle in `#52B788` (matches agent frame accent), bottom-right corner of a 32×32 canvas.
- Thin white (or near-white) stroke around the circle so it stays visible on green/dark favicons.
- Dot size ~28–35% of favicon edge; not covering the whole icon.

## Technical approach

### Integration points (`background.js`)

- Extend `injectAgentFrame` path (or a sibling inject called from `showAgentFrame` / `updateAgentFrame`) to also apply the favicon badge.
- Extend `removeAgentFrame` path to restore the original favicon.
- Reuse existing http(s) URL guards; no new permissions required (`scripting` + host access already present).

### Injected page logic

1. Capture current favicon URL from `<link rel="icon">` / `shortcut icon` / `/favicon.ico` fallback.
2. Persist original URL once (e.g. `data-browser-mcp-original-favicon` on `document.documentElement`, or a dedicated marker element) so repeated applies do not nest badges.
3. Load image → draw to canvas → draw badge circle → set `href` of a managed `<link rel="icon" id="browser-mcp-agent-favicon">` (or replace existing icon link carefully).
4. On remove: restore original `href` / remove managed link and reinstate prior link state; clear the original-URL marker.

### Edge cases

| Case | Handling |
|------|----------|
| Cross-origin favicon (canvas taint) | Draw badge on blank/neutral base, or skip image and use solid badge-only icon; prefer best-effort without throwing |
| Site updates favicon after inject | `onUpdated` complete + optional MutationObserver is out of scope for v1; rely on complete + next agent action re-apply |
| Restricted URLs (`chrome://`, etc.) | Skip (same as agent frame) |
| Multiple rapid applies | Idempotent: if badge already applied and original saved, no-op or redraw once from saved original |

## Testing

- Navigate + agent action on a normal https page → tab strip shows badged favicon; page still has green frame.
- Agent clear / stop path that calls `clearAllAgentFrames` → favicon restored.
- Reload marked tab → badge returns after load complete.
- Switch away and back among marked/unmarked tabs → no stray badges on unmarked tabs.

## Out of scope follow-ups

- MutationObserver for aggressive SPA favicon churn.
- Tab Groups “high visibility” mode.
- Optional title prefix.
