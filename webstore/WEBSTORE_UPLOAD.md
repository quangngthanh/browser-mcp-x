# BrowserMCP – Chrome Web Store Upload Guide v0.4.0

## Vorbereitete Dateien

| Datei | Pfad |
|-------|------|
| Extension-ZIP | `/tmp/browsermcp-v0.4.0.zip` |
| Entpackte Extension | `/tmp/browsermcp-v0.4.0-unpacked/` |
| Permission-Begründungen | `/home/torben/projects/browser-mcp/webstore/permissions-justification.md` |
| Promo-Tile Briefing | `/home/torben/projects/browser-mcp/webstore/promo-tile-brief.md` |
| Datenschutzerklärung (live) | `https://tabtii.github.io/browser-mcp/privacy.html` |
| Checkout (Pro) | `https://tabtii.lemonsqueezy.com/checkout/buy/ee56313d-60e1-4181-9b5b-48a9183f469c` |

## Schritt-für-Schritt Upload

1. Chrome öffnen (Login muss manuell erfolgen, Google blockiert Browser-Login durch Tools)
2. `https://chrome.google.com/webstore/devconsole/` öffnen
3. Auf **New Item** klicken
4. `/tmp/browsermcp-v0.4.0.zip` hochladen
5. Folgende Felder ausfüllen:

### Store Listing

- **Title:** BrowserMCP — AI Browser Control via MCP
- **Summary:** Turn Chrome into an MCP server. AI agents control your browser: navigate, click, type, screenshot.
- **Description:**
  ```
  BrowserMCP turns your Chrome browser into a Model Context Protocol (MCP) server.
  Connect your AI agent and let it browse the web, click buttons, fill forms, extract text, take screenshots, and more.

  Perfect for automation, testing, web scraping, and agentic workflows.
  No command-line setup, no separate browser — just install the extension, start the relay, and connect your MCP client.

  Pro unlocks 11 advanced tools including wait_for_element, get_interactive_elements, click_text, hover, drag_and_drop, handle_dialog, and get_markdown.
  ```
- **Category:** Developer Tools
- **Language:** English (Primary)
- **Website:** `https://github.com/Tabtii/browser-mcp`
- **Support URL:** `https://github.com/Tabtii/browser-mcp/issues`
- **Privacy Policy URL:** `https://tabtii.github.io/browser-mcp/privacy.html`
- **Contact email:** `torbi95@gmail.com`

### Grafiken (hochladen)

| Asset | Größe | Pfad/Status |
|-------|-------|-------------|
| App Icon | 128×128 | `icons/icon128.png` (im ZIP enthalten) |
| Screenshot 1 | 1280×800 | Noch zu erstellen (siehe Promo-Tile Briefing) |
| Screenshot 2 | 1280×800 | Noch zu erstellen |
| Small Promo Tile | 440×280 | Noch zu erstellen |
| Large Promo Tile | 920×680 | Noch zu erstellen |
| Marquee Promo Tile | 1400×560 | Noch zu erstellen |

### Pricing & Distribution

- **Monetization:** Paid (One-time purchase)
- **Price:** 9.00 USD (oder regional anpassen)
- **Visibility:** Public
- **Markets:** All markets where developer accounts can publish

### Permissions

Bei jedem Berechtigungshinweis den passenden Text aus `webstore/permissions-justification.md` kopieren.

### Privacy

- **Single Purpose:** „This extension exposes the user's browser as an MCP server so AI agents can perform authorized web automation tasks. The sole purpose is browser control via MCP."
- **Remote Code:** No
- **Data Usage:** See `permissions-justification.md` → Datenweitergabe-Abschnitt
- **Privacy Policy URL:** `https://tabtii.github.io/browser-mcp/privacy.html`

## Nach dem Upload

1. Auf **Submit for review** klicken
2. Review dauert in der Regel 1–3 Werktage
3. Nach Freigabe: Extension-ID notieren und in Landing Page + Docs eintragen
4. LemonSqueezy Checkout auf Live-Mode umstellen (aktuell noch Test-Mode)

## Bekannte Store-Blocker

- Publisher-E-Mail in Dev-Console-Account-Einstellungen bestätigen
- 8 Permission-Justifications müssen ausgefüllt werden
- Single-Purpose-Absatz muss präzise sein
- Datenschutzerklärung muss alle erfassten Daten erklären
