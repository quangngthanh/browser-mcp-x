# BrowserMCP v0.4.0 — Chrome Web Store Upload-Schritt-für-Schritt

## Voraussetzungen
- Google-Konto mit aktivierter 2FA (Chrome Web Store zwingend erforderlich)
- Einmalige Registrierung als Chrome Web Store Developer (einmalige Gebühr ~5 USD)
- Google blockiert Browser-Login → Upload muss im lokalen Chrome des Nutzers erfolgen

## Dateien, die du brauchst

| Datei | Absoluter Pfad | Zweck |
|---|---|---|
| Extension-ZIP | `/tmp/browsermcp-v0.4.0.zip` | Upload-Paket |
| Unpacked (zur Kontrolle) | `/tmp/browsermcp-v0.4.0-unpacked/` | Lokale Prüfung |
| Store-Beschreibung | `/home/torben/projects/browser-mcp/webstore/description.md` | Long description |
| Kurzbeschreibung | `/home/torben/projects/browser-mcp/webstore/short-description.txt` | Short description |
| Datenschutzerklärung | `/home/torben/projects/browser-mcp/privacy.html` | Privacy policy URL |
| Berechtigungs-Begründung | `/home/torben/projects/browser-mcp/webstore/permissions-justification.md` | Permission justifications |
| Promo-Tile-Briefing | `/home/torben/projects/browser-mcp/webstore/promo-briefing.md` | Für Designer |
| Screenshots / Promo-Assets | `/home/torben/projects/browser-mcp/webstore/screenshots/` | Fertige PNGs |

## Schritt 1 — ZIP aktualisieren (bereits erledigt)
```bash
cd /home/torben/projects/browser-mcp
rm -rf /tmp/browsermcp-v0.4.0-unpacked
mkdir -p /tmp/browsermcp-v0.4.0-unpacked
cp manifest.json background.js popup.html popup.js offscreen.html offscreen.js icons/* \
   /tmp/browsermcp-v0.4.0-unpacked/
cd /tmp/browsermcp-v0.4.0-unpacked
zip -r /tmp/browsermcp-v0.4.0.zip .
```
**Aktuelles ZIP:** `/tmp/browsermcp-v0.4.0.zip` (50.694 Bytes, Stand 19:11 Uhr)

## Schritt 2 — Chrome Web Store Developer Dashboard öffnen
1. Im **lokalen Chrome** des Nutzers öffnen: https://chrome.google.com/webstore/devconsole/
2. Mit dem Google-Konto anmelden.
3. Sicherstellen, dass die Developer-Registrierung abgeschlossen ist.

## Schritt 3 — Neues Item anlegen
1. **“New Item”** / **“Neues Element”** klicken.
2. Das ZIP `/tmp/browsermcp-v0.4.0.zip` hochladen.
3. Warten, bis Chrome Web Store das Paket verarbeitet hat.

## Schritt 4 — Store-Listing ausfüllen

### Identität
| Feld | Inhalt |
|---|---|
| **Language** | English (Standard) |
| **Store listing language** | English |
| **Name** | BrowserMCP — AI Browser Control via MCP |
| **Short description** | `Turn Chrome into an MCP server. 35 tools: navigate, click, type, screenshot, record, batch, forms, network, markdown, hover, drag-drop. 100% local. Zero npm.` |
| **Detailed description** | Inhalt aus `description.md` kopieren (max. 16.000 Zeichen). |

### Kategorie
- **Category:** Developer Tools
- **Featured categories / Attributes:** Optional: Productivity, AI & Machine Learning

### URLs
| Feld | Inhalt |
|---|---|
| **Privacy policy** | `https://raw.githubusercontent.com/Tabtii/browser-mcp/master/privacy.html` (oder auf eigenen Webspace hosten) |
| **Support / Contact email** | `torbi95@gmail.com` |
| **Website** | `https://github.com/Tabtii/browser-mcp` |

## Schritt 5 — Grafiken hochladen

| Asset | Pfad im Repo | Anforderungen |
|---|---|---|
| Extension icon | `icons/store-icon-128.png` | 128×128 PNG |
| Screenshots (max. 5) | `webstore/screenshots/*.png` | 1280×800 oder 640×400 PNG |
| Small promo tile | `webstore/screenshots/small-promo-440x280.png` | 440×280 PNG |
| Large promo tile | `webstore/screenshots/large-promo-920x680.png` | 920×680 PNG |
| Marquee promo tile | `webstore/screenshots/marquee-promo-1400x560.png` | 1400×560 PNG |

Hinweis: Falls die vorhandenen `screenshots/` nicht final sind, kannst du das Briefing `webstore/promo-briefing.md` an einen Designer geben.

## Schritt 6 — Berechtigungen begründen (Permissions Justification)
Beim Hochladen fragt der Store nach Begründungen für jede Permission. Kopiere aus `permissions-justification.md`:

1. **activeTab**  
   > Wenn der Nutzer ein Tool ausführt, greift die Extension nur auf den aktuell aktiven Tab zu und nur für die Dauer der Aktion. So bekommt der Nutzer volle Kontrolle: er entscheidet welcher Tab gesteuert wird, und kein anderer Tab wird gelesen oder verändert.

2. **tabs**  
   > Wird benötigt um Tabs aufzulisten, zwischen ihnen zu wechseln, neue Tabs zu erstellen und Tabs zu schließen — das sind MCP-Tools wie `get_tabs`, `switch_tab`, `create_tab` und `close_tab`. Außerdem liefert die Permission die URL und den Titel des aktiven Tabs für `get_page_info` und Navigation. Es werden keine Inhalte anderer Tabs gelesen.

3. **scripting**  
   > Wird benutzt um JavaScript in Webseiten auszuführen, damit MCP-Tools wie `click`, `type_text`, `extract_text`, `get_dom`, `get_markdown`, `wait_for_element`, `highlight` und `evaluate` funktionieren. Das Skript wird nur per explizitem Tool-Call vom Nutzer gestartet, niemals automatisch.

4. **storage**  
   > Speichert ausschließlich die Nutzer-Präferenzen lokal: Relay-Status (AN/AUS), gespeicherte MCP-Portnummer, Pro-Lizenzschlüssel und Aufnahme-Sessions für die `start_recording` / `playback` Tools. Keine Telemetrie, keine Nutzungsdaten, keine externen Server.

5. **debugger**  
   > Das `screenshot` Tool nutzt die Chrome DevTools Protocol API über `chrome.debugger` um Pixel aus dem Tab zu lesen — das ist der einzige Weg in einer reinen MV3-Extension verlässlich Screenshots zu bekommen, weil `chrome.tabs.captureVisibleTab` an CSP-sensible Sites scheitert. Die Debugger-Session wird nach jedem Screenshot sofort wieder getrennt.

6. **offscreen**  
   > Die Extension braucht eine persistente WebSocket-Verbindung zum lokalen Relay-Server. Service Worker in MV3 dürfen keine WebSockets halten, also wird ein Offscreen-Dokument mit Reason `WORKERS` erstellt. Nur sichtbar während der MCP-Server läuft (Nutzer klickt 'Start' im Popup).

7. **host_permissions: `<all_urls>`**  
   > BrowserMCP ist ein allgemeines Browser-Control-Tool für AI-Agents. Der Nutzer gibt über das MCP-Protokoll explizit eine URL an — die Extension muss auf jeder beliebigen Seite Inhalte lesen und manipulieren können, sonst wäre das Tool auf eine Handvoll Domains beschränkt und nutzlos. Es werden keine Daten an externe Server gesendet, keine Inhalte protokolliert, kein Verhalten außerhalb der Tool-Calls.

8. **Remote code / `new Function(...)` im `evaluate` Tool**  
   > Die Extension nutzt `new Function(...)` im `evaluate` Tool, um vom AI-Agent geschicktes JavaScript in der aktiven Webseite auszuführen. Das ist die einzige Möglichkeit, ein generisches Code-Ausführungs-Tool ohne eigene Code-Compilation bereitzustellen. Eingaben werden 1:1 vom MCP-Request durchgereicht — der Nutzer entscheidet explizit wann `evaluate` aufgerufen wird. Es wird kein Code von einem externen Server geladen; das `connect-src` in der CSP erlaubt ausschließlich `localhost` / `127.0.0.1`.

## Schritt 7 — Single-Purpose-Absatz
Falls das Feld “Single Purpose Description” im Store erscheint, verwenden:

> BrowserMCP has exactly one purpose: enabling users to control their Chrome browser remotely via the Model Context Protocol (MCP) from a local AI agent. All 35 tools — navigation, clicks, text input, screenshots, DOM extraction, form filling, tab management, recording — serve exclusively this purpose. There are no additional features, trackers, advertisements, or analytics.

## Schritt 8 — Datennutzungserklärung
Im Abschnitt **“Data usage”** / **“Datennutzung”** angeben:

> Diese Extension sammelt, nutzt oder überträgt keine Nutzerdaten an Dritte. Alle Operationen laufen lokal zwischen Chrome, dem BrowserMCP-Service-Worker und dem optionalen lokalen Relay-Server auf `127.0.0.1`. Es gibt kein Analytics, kein Tracking, keine externen API-Calls.

Wichtig: Da `<all_urls>` und `debugger` verwendet werden, kann der Store trotzdem eine Warnung ausgeben — die obigen Begründungen decken die üblichen Review-Fragen ab.

## Schritt 9 — Preis / Verbreitung
- **Distribution:** Public (oder “Unlisted” für gezielte Tester)
- **Price:** Free (kostenlos)
- **Regions:** Alle verfügbaren Länder, oder initial nur Deutschland + USA

## Schritt 10 — Review einreichen
1. **“Save draft”** → **“Submit for review”**.
2. Review-Zeit: meist 1–3 Werktage, bei sensiblen Permissions (`debugger`, `<all_urls>`) evtl. länger.
3. E-Mail-Benachrichtigungen im Dashboard und an `torbi95@gmail.com` beobachten.

## Nächste Aktionen für den Nutzer
1. **ZIP-Datei prüfen:** `/tmp/browsermcp-v0.4.0.zip` liegt bereit.
2. **Lokalen Chrome öffnen** und zu https://chrome.google.com/webstore/devconsole/ navigieren.
3. **Neues Item anlegen** und ZIP hochladen.
4. **Store-Listing** mit den obigen Texten befüllen.
5. **Screenshots / Promo-Tiles** aus `webstore/screenshots/` hochladen (oder zuerst Briefing an Designer senden).
6. **Permission-Justifications** aus `permissions-justification.md` kopieren.
7. **Datenschutzerklärung** hinterlegen (`privacy.html` auf GitHub hosten).
8. **Zur Review einreichen**.

## Absolute Pfade (Zusammenfassung)
- ZIP: `/tmp/browsermcp-v0.4.0.zip`
- Unpacked: `/tmp/browsermcp-v0.4.0-unpacked/`
- Repo: `/home/torben/projects/browser-mcp/`
- Manifest: `/home/torben/projects/browser-mcp/manifest.json`
- Berechtigungs-Begründungen: `/home/torben/projects/browser-mcp/webstore/permissions-justification.md`
- Store-Beschreibung: `/home/torben/projects/browser-mcp/webstore/description.md`
- Kurzbeschreibung: `/home/torben/projects/browser-mcp/webstore/short-description.txt`
- Datenschutzerklärung: `/home/torben/projects/browser-mcp/privacy.html`
- Promo-Tile-Briefing: `/home/torben/projects/browser-mcp/webstore/promo-briefing.md`
- Vorhandene Assets: `/home/torben/projects/browser-mcp/webstore/screenshots/`
