# Chrome Web Store — Listing-Informationen

## Basis-Informationen

| Feld | Wert |
|---|---|
| **Name** | BrowserMCP — AI Browser Control via MCP |
| **Zusammenfassung** (132 Zeichen) | Machen Sie Chrome zum MCP-Server. 16 Tools: navigieren, klicken, Screenshots, DOM, Formulare. 100% lokal. Zero npm. |
| **Kategorie** | Entwicklertools (Developer Tools) |
| **Sprache** | Deutsch |
| **Lizenz** | MIT |
| **Version** | 0.1.0 |
| **Manifest-Version** | 3 |

## Sichtbarkeit

- **Veröffentlichungsstatus:** Ungelistet (Unlisted) — da das Repo privat ist
- **Nutzung beschränken:** Ja (nur für Entwickler/AI-Enthusiasten)

## Grafik-Anforderungen

| Asset | Größe | Format | Status |
|---|---|---|---|
| Extension-Icon 16×16 | 16×16px | PNG | ✅ Vorhanden (`icons/icon16.png`) |
| Extension-Icon 48×48 | 48×48px | PNG | ✅ Vorhanden (`icons/icon48.png`) |
| Extension-Icon 128×128 | 128×128px | PNG | ✅ Vorhanden (`icons/icon128.png`) |
| Screenshot 1 | 1280×800px | PNG | ⚠️ Zu erstellen |
| Screenshot 2 | 1280×800px | PNG | ⚠️ Zu erstellen |
| Screenshot 3 | 1280×800px | PNG | ⚠️ Zu erstellen |
| Screenshot 4 | 1280×800px | PNG | ⚠️ Zu erstellen |
| Screenshot 5 | 1280×800px | PNG | ⚠️ Zu erstellen |
| Small Promo Tile | 440×280px | PNG/JPG | ⚠️ Zu erstellen |
| Large Promo Tile | 920×680px | PNG/JPG | ⚠️ Zu erstellen |
| Marquee Promo | 1400×560px | PNG/JPG | ⚠️ Zu erstellen |

## Screenshot-Inhalte (Vorschläge)

1. **Popup-Main** — Das BrowserMCP-Popup mit Server-Status "Läuft", WebSocket-Adresse und Tool-Liste
2. **MCP-Config** — Die Kopier-fähige MCP-Konfiguration im Popup
3. **AI-Agent-Verbunden** — Popup mit grünem Status "Verbunden ✓"
4. **AI-Navigation** — AI-Agent navigiert zu einer Website (Cursor-Showcase)
5. **Architektur** — Diagramm der Architektur (AI → Relay → Extension → Tab)

## Pflichtfelder für Store-Listing

- [x] Detaillierte Beschreibung (`description.md`)
- [x] Kurze Zusammenfassung (`short-description.txt`)
- [x] Datenschutzerklärung (`privacy-policy.md`)
- [x] Berechtigungs-Begründung (`permissions-justification.md`)
- [x] FAQ / Support (`faq.md`)
- [x] Screenshots (Templates unter `screenshot-templates/`)
- [x] Promotional Tiles (Templates unter `promo-templates/`)

## Verkaufsargumente (für interne Notizen)

1. **Zero-Setup** — Kein npm, kein Node, kein pip. Nur Python 3.
2. **16 MCP-Tools** — Mehr als Playwright MCP (~10)
3. **100% lokal** — Keine Telemetrie, keine Cloud
4. **Echte Sitzung** — Nutzt angemeldete Tabs
5. **Minimal** — ~50KB Extension + 10KB Relay
6. **Offener Standard** — MCP von Anthropic