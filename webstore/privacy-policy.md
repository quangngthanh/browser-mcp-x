# Datenschutzerklärung — BrowserMCP

**Stand: Juli 2026**

## Zusammenfassung

BrowserMCP verarbeitet **alle Daten ausschließlich lokal** auf Ihrem Rechner. Es werden **keine Daten an externe Server übertragen**, keine Telemetrie gesammelt und keine Analytics-Daten erzeugt.

## Datenerfassung

### Was wir NICHT sammeln

- ❌ Keine Telemetrie
- ❌ Keine Analytics
- ❌ Keine Fehlerberichte an externe Server
- ❌ Keine Verfolgung (Tracking)
- ❌ Keine Cloud-Anbindung
- ❌ Keine Kontoverwaltung
- ❌ Keine externen API-Aufrufe

### Was lokal verarbeitet wird

Wenn Sie BrowserMCP verwenden, verarbeitet die Extension folgende Daten **ausschließlich lokal**:

1. **Browser-Tab-Informationen** — Titel, URL und Inhalt des aktiven Tabs werden an den verbundenen AI-Agenten übermittelt. Diese Übertragung erfolgt über `localhost` (127.0.0.1) und verlässt niemals Ihren Rechner.
2. **WebSocket-Verbindung** — Die Kommunikation zwischen Extension und Relay-Script läuft über `ws://localhost:9274`. Diese Verbindung ist auf `127.0.0.1` beschränkt.
3. **Chrome Storage** — Die Extension speichert den Status (läuft/gestoppt, Port-Nummer) in der lokalen Chrome-Storage. Diese Daten werden nicht synchronisiert und nicht an Google übertragen.

## Berechtigungen

| Berechtigung | Zweck |
|---|---|
| `activeTab` | Zugriff auf den aktiven Tab für AI-Agent-Befehle |
| `tabs` | Auflisten, Wechseln und Schließen von Tabs |
| `scripting` | Ausführen von Skripten in Tabs (Klicks, Texteingabe, DOM-Extraktion) |
| `storage` | Speichern des Extension-Status (läuft/gestoppt) |
| `debugger` | Für erweiterte Browser-Kontrollfunktionen |
| `notifications` | Status-Benachrichtigungen an den Nutzer |
| `offscreen` | Ausführen des WebSocket-Servers in einem Offscreen-Dokument |
| `<all_urls>` | AI-Agent muss auf beliebige Seiten navigieren können |

## Datenübertragung

Die einzige Datenübertragung erfolgt zwischen:

1. **AI-Agent ↔ relay.py** — über Standard-stdio (lokal)
2. **relay.py ↔ Chrome Extension** — über WebSocket auf `127.0.0.1:9274` (lokal)
3. **Extension ↔ Browser-Tab** — über Chrome-Scripting-API (lokal)

**Keine dieser Verbindungen verlässt Ihren Rechner.**

## Drittanbieter

BrowserMCP verwendet **keine Drittanbieter-Dienste**. Es werden keine SDKs für Analytics, Telemetrie oder Fehlerberichte eingebunden.

## Open Source

BrowserMCP ist Open Source (MIT-Lizenz). Der vollständige Quellcode ist unter https://github.com/Tabtii/browser-mcp einsehbar. Sie können jeden Aspekt der Datenverarbeitung selbst überprüfen.

## Kontakt

Bei Fragen zum Datenschutz: https://github.com/Tabtii/browser-mcp/issues