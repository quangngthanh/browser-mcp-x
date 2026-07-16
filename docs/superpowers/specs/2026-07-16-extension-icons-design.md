# Extension Icons — Browser MCP X

**Date:** 2026-07-16  
**Status:** Approved

## Goal

Replace broken/outdated toolbar and store icons with a cohesive bright-blue mark that reads as “Browser MCP X” at 16px–128px.

## Concept

**Browser window + up arrow** (flat, minimal):

- Rounded square tile
- Simplified browser chrome (title-bar dots + content area)
- Bold white **up arrow** centered in the content area (not an X — avoids “block/close” reading)

## Color

| Role | Hex |
|------|-----|
| Background | `#2563EB` (solid; optional soft fill to `#3B82F6` only if it stays crisp at 16px) |
| Mark | `#FFFFFF` |
| Style | Flat — no glow, no multi-layer shadow, no purple |

## Deliverables

| File | Size | Use |
|------|------|-----|
| `icons/icon16.png` | 16×16 | Toolbar / favicon-scale |
| `icons/icon48.png` | 48×48 | Extensions page |
| `icons/icon128.png` | 128×128 | Install / management |
| `icons/store-icon-128.png` | 128×128 | Chrome Web Store listing |

`manifest.json` paths stay unchanged.

## Constraints

- Safe padding ~12% so the mark does not clip when Chrome masks the tile
- Geometry must remain legible at 16×16 (thick strokes, no fine hairlines)
- No text; mark is a single up-arrow glyph only

## Out of scope

- Popup HTML emoji / docs favicon (separate pass)
- Web store screenshots / promo images
