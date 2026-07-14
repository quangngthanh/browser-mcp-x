# Häufig gestellte Fragen (FAQ) — BrowserMCP

## Allgemein

### Was ist BrowserMCP?

BrowserMCP ist eine Chrome-Erweiterung, die Ihren Browser in einen MCP-Server (Model Context Protocol) verwandelt. AI-Agenten wie Claude oder Cursor können dadurch Ihren Browser steuern — Seiten navigieren, klicken, Formulare ausfüllen, Screenshots machen und mehr.

### Was ist MCP?

MCP (Model Context Protocol) ist ein offener Standard, der AI-Agenten den Zugriff auf externe Werkzeuge und Datenquellen ermöglicht. Es wird von Anthropic (Claude) entwickelt und von Cursor, Claude Desktop und anderen AI-Clients unterstützt.

### Brauche ich Node.js oder npm?

**Nein.** BrowserMCP benötigt nur Python 3, das auf macOS und Linux standardmäßig vorinstalliert ist. Auf Windows ist es ein kleiner Download. Kein npm, kein pip, keine zusätzlichen Abhängigkeiten.

## Installation & Setup

### Wie installiere ich die Extension?

1. Repository herunterladen
2. `chrome://extensions/` öffnen
3. **Entwicklermodus** (oben rechts) aktivieren
4. **Entpackte Erweiterung laden** → `browser-mcp` Ordner auswählen

### Wie starte ich den Relay?

Öffnen Sie ein Terminal und führen Sie aus:

```bash
python3 relay.py
```

Das war's. Keine pip-Installation, keine npm-Pakete.

### Wie verbinde ich meinen AI-Agenten?

Fügen Sie diese Konfiguration zu Ihrem MCP-Client hinzu:

**Cursor / Claude Desktop:**

```json
{
  "mcpServers": {
    "browser-mcp": {
      "command": "python3",
      "args": ["/pfad/zu/relay.py"]
    }
  }
}
```

Starten Sie dann die BrowserMCP-Extension (Icon klicken → Start).

## Datenschutz

### Werden Daten an externe Server übertragen?

**Nein.** Alle Datenverarbeitung erfolgt lokal. Der Relay lauscht nur auf `127.0.0.1`. Es gibt keine Telemetrie, keine Analytics, keine Cloud-Verbindung.

### Kann die Extension meine Passwörter lesen?

Die Extension hat technischen Zugriff auf die Seiteninhalte Ihres aktiven Tabs (erforderlich für die AI-Steuerung). Die Daten verlassen jedoch nie Ihren Rechner und werden nur an den lokal verbundenen AI-Agenten übermittelt.

### Werden Browser-Daten gespeichert?

Die Extension speichert nur ihren eigenen Status (Server läuft/gestoppt, Port-Nummer) in der lokalen Chrome-Storage. Es werden keine Browser-Daten, Verläufe oder Passwörter gespeichert.

## Tools & Funktionen

### Welche Tools stehen zur Verfügung?

16 Tools: `navigate`, `screenshot`, `get_dom`, `click`, `type_text`, `extract_text`, `scroll`, `get_tabs`, `switch_tab`, `close_tab`, `evaluate`, `get_page_info`, `fill_form`, `wait`, `press_key`, `get_links`.

### Funktioniert es mit meiner bestehenden Browsersitzung?

**Ja.** Im Gegensatz zu Playwright nutzt BrowserMCP Ihre echte Chrome-Sitzung mit allen angemeldeten Konten, Cookies und Sitzungsdaten.

## Fehlerbehebung

### Der AI-Agent verbindet sich nicht

1. Prüfen Sie, ob `python3 relay.py` läuft
2. Prüfen Sie, ob die Extension gestartet ist (Icon → Start)
3. Prüfen Sie, ob der MCP-Pfad in der Config korrekt ist
4. Prüfen Sie, ob Port 9274 frei ist

### "Browser extension not connected"

Die Extension ist nicht gestartet. Klicken Sie auf das BrowserMCP-Icon → **Start**. Stellen Sie sicher, dass der Relay läuft.

### Die Extension funktioniert nicht nach Chrome-Update

Laden Sie die Extension neu: `chrome://extensions/` → Reload-Button bei BrowserMCP.

---

Weitere Fragen? https://github.com/Tabtii/browser-mcp/issues