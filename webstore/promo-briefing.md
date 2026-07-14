# BrowserMCP v0.4.0 — Chrome Web Store Promo-Tile Design-Briefing

## Ziel
Fünf finale PNGs für den Chrome-Web-Store-Upload der BrowserMCP-Extension (Version 0.4.0).

## Branding
- **Name:** BrowserMCP — AI Browser Control via MCP
- **Slogan/Tagline:** “Give AI agents control over your browser. Zero setup. 100% local.”
- **Primary URL:** https://github.com/Tabtii/browser-mcp

## Farbpalette (muss exakt verwendet werden)

| Name | Hex | Verwendung |
|---|---|---|
| Sage Green | `#2D6A4F` | Primärfarbe, Header, Buttons |
| Fresh Green | `#52B788` | Akzente, Links, Hervorhebungen |
| Dark | `#0F1512` | Haupt-Hintergrund (nie reines Schwarz) |
| Dark Card | `#1A221E` | Karten, Panels, Code-Blocks |
| Border | `#2A3A32` | Borders, Dividers, subtile Linien |
| Text Muted | `#8A9B91` | Sekundärer Text |
| Text Light | `#E2E9E5` | Primärer Text / Überschriften |
| Warning | `#E8A33D` | Status-Badge “Wartung” |
| Danger | `#E55934` | Stop-/Fehler-Elemente |

## Typografie
- Überschriften: `Inter`, `SF Pro Display`, `Segoe UI` oder system-ui, Bold/Black (`900`), ggf. `-1px` bis `-2px` Letter-spacing
- Fließtext/Tags: Medium (`500–700`), 12–16 px
- Code/Terminal: `SF Mono`, `Fira Code`, `JetBrains Mono`, `Courier New`

## Verwendete Emoji/Icons (nur als Inspiration, gern als eigene Vektor-Icons umsetzen)
- Logo-Mark: 🌐 (Globus) oder eigenes stilisiertes “MCP”-Glyph
- Tool-Icons: 🛠️, 🔒, ⚡, 🌐, 🖱️, ⌨️, 📸, 📝

## 1. Marquee Promo Tile — 1400 × 560 px
**Format:** PNG 24/32-Bit, keine Transparenz

### Layout
- **Hintergrund:** Dunkler Farbverlauf `#0F1512` → `#1A221E` (diagonal 135°)
- **Große, zentrale Headline links:**  
  “BrowserMCP” — “MCP” in `#52B788`, Rest in `#E2E9E5`, ca. 56–64 px, font-weight 900
- **Subheadline darunter (max. 2 Zeilen):**  
  “Give AI agents control over your browser. Zero setup. 100% local.”  
  Farbe: `#8A9B91`, ca. 22 px
- **Feature-Chips (links unter Subheadline):** abgerundete Pillen/Chips mit `#2D6A4F` Border und `#52B788` Text:
  - 35 MCP Tools
  - 100% Local
  - Zero npm
  - ~60 KB
- **Rechte Seite:** stilisiertes Terminal-/Code-Fenster (Dark Card `#1A221E`, Border `#2A3A32`, abgerundete Ecken 12 px) mit drei Zeilen Mock-Code in Grün/Türkis:
  ```
  $ python3 relay.py
  → ws://localhost:9274 ✓
  → AI agent connected ✓
  ```
- **Subtile Glüheffekte:** zwei weiche, radial grüne Glows (nicht grell), Deckkraft ≤ 15 %
- **Kein Small-Print, kein QR-Code, keine reale Person**

## 2. Large Promo Tile — 920 × 680 px
**Format:** PNG

### Layout
- Zentrierte Komposition
- **Top:** Logo-Mark (Globus) + “BrowserMCP” Headline, “MCP” akzentuiert
- **Darunter:** Tagline “AI Browser Control via Model Context Protocol”
- **4 Feature-Karten (2×2 Grid):** abgerundet 12 px, `#1A221E` mit `#2A3A32` Border
  - 🛠️ 35 Tools — Full browser control
  - 🔒 100% Local — No telemetry
  - ⚡ Zero npm — Python 3 only
  - 🌐 Your session — Logged-in tabs
- **Bottom:** Reihe von Tool-Chips (`navigate`, `screenshot`, `click`, `type_text`, `get_dom`, `evaluate`, `get_tabs`, `fill_form` etc.) in Sage-Green / Fresh-Green
- **Footer:** “BrowserMCP v0.4.0 · MIT License · github.com/Tabtii/browser-mcp” in `#6B7B72`, 12–13 px

## 3. Small Promo Tile — 440 × 280 px
**Format:** PNG

### Layout
- Kompakte zentrierte Komposition
- **Oben:** Logo-Mark 48 px
- **Headline:** “BrowserMCP”, “MCP” in `#52B788`
- **Subline:** “AI Browser Control via MCP”
- **3 Chips horizontal:** 35 Tools | 100% Local | Zero npm
- Hintergrund: gleicher dunkler Gradient mit einem kleinen, subtilen grünen Glow

## 4–8. Screenshots — 1280 × 800 px (max. 5 Stück)
**Format:** PNG, konsistente UI-Skin

### Screenshot 1 — Popup-UI
Zeige das BrowserMCP-Popup: Header mit “BrowserMCP”, grüner “Start”-/“Stop”-Button, Status-Badge “Relay: offline/online”, Tool-Liste/Grid mit 8–12 Tool-Namen (z. B. navigate, screenshot, click, type_text, get_tabs, evaluate, fill_form, record).

### Screenshot 2 — AI-Agent Demo
Split-Screen oder überlagerter Look: links ein Chat/Terminal der sagt *“Click the Login button and take a screenshot”*, rechts der Browser, in dem ein Button per grünem Highlight-Rahmen markiert ist. Verdeutlicht: KI steuert den Browser.

### Screenshot 3 — Architektur-Diagramm
Sauberes Diagramm mit Pfeilen:

```
AI Agent (Claude / Cursor / Hermes)
        ↕ stdio (JSON-RPC)
   relay.py (Python, zero deps)
        ↕ WebSocket (127.0.0.1)
   Chrome Extension (MV3)
        ↕ chrome.scripting API
      Browser Tab
```

Farben: Dark-Hintergrund, `#52B788` für Pfeile/Headlines, `#1A221E` für Boxen.

### Screenshot 4 — MCP Tool-Grid
Großes, scrollbares Tool-Grid mit allen 35 Tool-Namen als farbige Chips/Kacheln, eingeteilt in Gruppen:
- Core (navigate, screenshot, click, type_text, extract_text, scroll, get_tabs, switch_tab, close_tab, get_page_info, fill_form, press_key)
- Advanced (start_recording, playback, batch_execute, get_console_logs, get_network_requests, auto_fill_form)
- Pro (highlight, wait_for_element, get_interactive_elements, click_by_id, type_by_id, click_text, hover, drag_and_drop, handle_dialog, get_markdown)

### Screenshot 5 — 3-Step Setup
Drei nummerierte Schritte (1 → 2 → 3) mit Icons:
1. **Install extension** — Chrome Web Store Badge/Icon
2. **Start relay** — `python3 relay.py` im Terminal
3. **Connect AI agent** — JSON-Config Snippet:
   ```json
   {
     "mcpServers": {
       "browser-mcp": {
         "command": "python3",
         "args": ["path/to/relay.py"]
       }
     }
   }
   ```

## Technische Anforderungen
- **Farbraum:** sRGB
- **Dateigröße:** je PNG ≤ 4 MB (Chrome Web Store Limit)
- **Keine Transparenz** bei Promo-Tiles; Screenshots gern mit geraden Kanten
- **Text lesbar auf kleinen Displays:** Mindestkontrast prüfen (WCAG AA)
- **Keine urheberrechtlich geschützten Logos** außer dem eigenen Markenzeichen
- **Keine Fake-Bewertungen, keine URLs zu Drittanbietern**

## Ausgabe-Dateinamen
```
browsermcp-marquee-1400x560.png
browsermcp-large-920x680.png
browsermcp-small-440x280.png
browsermcp-screenshot1-popup.png
browsermcp-screenshot2-ai-demo.png
browsermcp-screenshot3-architecture.png
browsermcp-screenshot4-tools.png
browsermcp-screenshot5-setup.png
```

## Referenzmaterialien im Repo
- HTML-Templates für Promo-Tiles: `/home/torben/projects/browser-mcp/webstore/promo-templates/`
- Screenshot-Templates: `/home/torben/projects/browser-mcp/webstore/screenshot-templates/`
- Bestehende gerenderte PNGs: `/home/torben/projects/browser-mcp/webstore/screenshots/`
- Store-Beschreibung: `/home/torben/projects/browser-mcp/webstore/description.md`
- Kurzbeschreibung: `/home/torben/projects/browser-mcp/webstore/short-description.txt`
