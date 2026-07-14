# Chrome Web Store Assets — BrowserMCP

Alle Assets für den Chrome Web Store Upload der BrowserMCP Extension.

## Übersicht

```
webstore/
├── description.md                  # Vollständige Store-Beschreibung (Deutsch)
├── short-description.txt           # Kurzzusammenfassung (≤132 Zeichen)
├── privacy-policy.md               # Datenschutzerklärung
├── permissions-justification.md    # Berechtigungs-Begründung
├── faq.md                          # Häufig gestellte Fragen
├── store-listing-info.md           # Store-Listing Metadaten & Checkliste
├── screenshot-templates/           # HTML-Templates für Screenshots (1280×800px)
│   ├── screenshot1-popup.html      # Popup mit 16 Tools & Status
│   ├── screenshot2-ai-demo.html    # AI-Agent Demo (Cursor steuert Browser)
│   ├── screenshot3-architecture.html # Architektur-Diagramm
│   ├── screenshot4-tools.html      # 16 Tools Übersicht
│   └── screenshot5-setup.html      # 3-Schritt Setup
└── promo-templates/                # HTML-Templates für Promo Tiles
    ├── small-promo-440x280.html    # Small Promo Tile
    ├── large-promo-920x680.html    # Large Promo Tile
    └── marquee-promo-1400x560.html # Marquee Promo Banner
```

## Screenshots erstellen

Die HTML-Templates können in Screenshots konvertiert werden mit:

### Option 1: Headless Chrome
```bash
for f in screenshot-templates/*.html; do
  name=$(basename "$f" .html)
  google-chrome --headless --screenshot="screenshots/${name}.png" \
    --window-size=1280,800 --default-background-color=00000000 "$f"
done

for f in promo-templates/*.html; do
  name=$(basename "$f" .html)
  google-chrome --headless --screenshot="promo/${name}.png" \
    --window-size=1280,800 --default-background-color=00000000 "$f"
done
```

### Option 2: Firefox
```bash
for f in screenshot-templates/*.html promo-templates/*.html; do
  firefox --screenshot "output/$(basename $f .html).png" "$f"
done
```

### Option 3: Puppeteer / Playwright
```javascript
const puppeteer = require('puppeteer');
const files = [
  ['screenshot1-popup', 1280, 800],
  ['screenshot2-ai-demo', 1280, 800],
  // ... etc
];
const browser = await puppeteer.launch();
for (const [name, w, h] of files) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  await page.goto(`file:///path/to/${name}.html`);
  await page.screenshot({ path: `output/${name}.png` });
}
```

## Chrome Web Store Anforderungen

### Pflichtfelder
- [x] Extension-Name: `BrowserMCP — AI Browser Control via MCP`
- [x] Kurzzusammenfassung (≤132 Zeichen)
- [x] Detaillierte Beschreibung (≤16.000 Zeichen)
- [x] Screenshots (mindestens 1, maximal 5)
- [x] Extension-Icon (128×128 PNG)
- [x] Kategorie: Entwicklertools
- [x] Datenschutzerklärung
- [x] Berechtigungs-Begründung

### Empfohlene Felder
- [x] Promo-Tiles (Small 440×280, Large 920×680, Marquee 1400×560)
- [x] FAQ / Support-Informationen
- [x] Kurze Demo-Video (optional, nicht enthalten)

### Brand-Farben
| Name | Hex | Verwendung |
|---|---|---|
| Sage Green | `#2D6A4F` | Primärfarbe, Header, Buttons |
| Fresh Green | `#52B788` | Akzent, Tool-Chips, Status |
| Dark | `#0F1512` | Hintergrund |
| Dark Card | `#1A221E` | Karten, Sections |
| Border | `#2A3A32` | Borders, Divider |
| Text Muted | `#8A9B91` | Sekundärer Text |
| Text Light | `#E2E9E5` | Primärer Text |
| Warning | `#E8A33D` | Wartungs-Status |
| Danger | `#E55934` | Stop-Button, Fehler |

## Upload

1. Extension als `.zip` packen (ohne `.git/`, `__pycache__/`, `webstore/`)
2. Chrome Web Store Developer Dashboard öffnen
3. Neues Item → ZIP hochladen
4. Listing-Informationen aus `description.md`, `privacy-policy.md` etc. einfügen
5. Screenshots und Promo-Tiles hochladen
6. Veröffentlichen

### ZIP erstellen
```bash
cd /home/torben/projects/browser-mcp
zip -r browsermcp-v0.1.0.zip manifest.json background.js popup.html popup.js \
  offscreen.html offscreen.js relay.py icons/ README.md
```