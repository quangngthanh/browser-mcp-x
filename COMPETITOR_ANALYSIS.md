# BrowserMCP — Konkurrenzanalyse & Feature-Priorisierung

> **Erstellt:** 03. Juli 2026  
> **Version:** BrowserMCP v0.2.0 (24 MCP Tools)  
> **Architektur:** Chrome Extension (MV3) + relay.py (Python, zero deps) + WebSocket  
> **GitHub:** https://github.com/Tabtii/browser-mcp (privat)

---

## Inhaltsverzeichnis

1. [Unsere aktuellen Tools](#unsere-aktuellen-tools)
2. [Konkurrenten im Detail](#konkurrenten-im-detail)
   - [1. hangwin/mcp-chrome (12k★)](#1-hangwinmcp-chrome-12k)
   - [2. Web MCP (Chrome Web Store)](#2-web-mcp-chrome-web-store)
   - [3. AgentHub (Chrome Web Store)](#3-agenthub-chrome-web-store)
   - [4. Algonius Browser MCP (Chrome Web Store)](#4-algonius-browser-mcp-chrome-web-store)
   - [5. Playwright MCP](#5-playwright-mcp)
   - [6. Browser Use for AI Agents (Chrome Web Store)](#6-browser-use-for-ai-agents-chrome-web-store)
3. [Vergleichende Feature-Matrix](#vergleichende-feature-matrix)
4. [Feature-Priorisierungstabelle](#feature-priorisierungstabelle)
5. [Empfohlene Roadmap](#empfohlene-roadmap)

---

## Unsere aktuellen Tools

BrowserMCP v0.2.0 bietet derzeit **25 MCP Tools** (16 Basis + 9 erweiterte):

### Basis-Tools (v0.1.0)
| # | Tool | Beschreibung |
|---|------|-------------|
| 1 | `navigate` | Zu einer URL navigieren |
| 2 | `screenshot` | Sichtbaren Tab-Bereich erfassen |
| 3 | `get_dom` | Vereinfachten Accessibility-Tree extrahieren |
| 4 | `click` | Element per CSS-Selector klicken |
| 5 | `type_text` | Text in Formularfelder eingeben |
| 6 | `extract_text` | Text-Inhalte von Seite/Selektor abrufen |
| 7 | `scroll` | Seite hoch/herunter scrollen |
| 8 | `get_tabs` | Alle offenen Tabs auflisten |
| 9 | `switch_tab` | Zu einem bestimmten Tab wechseln |
| 10 | `close_tab` | Tab per ID schließen |
| 11 | `evaluate` | JavaScript in der Seite ausführen |
| 12 | `get_page_info` | Titel, URL, Viewport-Größe abrufen |
| 13 | `fill_form` | Mehrere Formularfelder gleichzeitig ausfüllen |
| 14 | `wait` | N Millisekunden warten |
| 15 | `press_key` | Tastatureingabe simulieren |
| 16 | `get_links` | Alle Links einer Seite extrahieren |

### Erweiterte Tools (v0.2.0)
| # | Tool | Beschreibung |
|---|------|-------------|
| 17 | `start_recording` | Browser-Aktionen aufzeichnen |
| 18 | `stop_recording` | Aufzeichnung stoppen & als JSON zurückgeben |
| 19 | `playback` | Aufgezeichnete Aktionen abspielen |
| 20 | `detect_forms` | Alle Formulare mit Feldern erkennen |
| 21 | `auto_fill_form` | Formular mit AI-Werten auto-ausfüllen |
| 22 | `create_tab` | Neuen Tab mit optionaler URL erstellen |
| 23 | `batch_execute` | Mehrere Tool-Aufrufe in Sequenz ausführen |
| 24 | `get_console_logs` | Console-Logs erfassen (errors, warnings, logs) |
| 25 | `get_network_requests` | Netzwerk-Anfragen erfassen (URL, Method, Status) |

### Architektur-Merkmale
- **Zero Dependencies:** Nur Python 3 (relay.py ~10KB, Extension ~50KB)
- **Lokal:** Alles auf `127.0.0.1`, keine Telemetrie
- **Echte Sitzung:** Nutzt angemeldete Tabs mit Cookies/Sessions
- **Setup:** Extension laden + `python3 relay.py`

---

## Konkurrenten im Detail

### 1. hangwin/mcp-chrome (12k★)

**Repository:** https://github.com/hangwin/mcp-chrome  
**Stars:** ~12.000  
**Lizenz:** MIT (Open Source)

#### Features, die WIR NICHT haben
- **Element-Interaktion per Text/Label** — Klicken und Eingeben nicht nur per CSS-Selector, sondern auch per sichtbarem Text, ARIA-Label oder Position ("click the 'Submit' button")
- **Markdown-Content-Extraktion** — Gesamte Seite als strukturiertes Markdown exportieren (Tabellen, Listen, Links)
- **PDF-Reader** — PDF-Dokumente im Browser lesen und an AI senden
- **Element-Highlighting** — Visuelles Hervorheben von Elementen, die die AI gerade bearbeitet (rote Rahmen)
- **Interaktive Element-Liste** — Gibt eine nummerierte Liste aller interaktiven Elemente zurück (Button #1, Input #2, etc.), die AI dann per Nummer referenzieren kann
- **Cookie/Session-Management** — Cookies explizit auslesen und setzen
- **Tab-Gruppen** — Chrome Tab Groups unterstützen (Tabs gruppieren/auflösen)
- **Downloads-Verwaltung** — Downloads starten, pausieren, abbrechen
- **History-Zugriff** — Browser-Verlauf lesen und navigieren
- **Bookmark-Verwaltung** — Lesezeichen lesen/erstellen
- **FavIcon-Extraktion** — Icons von Tabs extrahieren

#### Tools
~20+ Tools: `navigate`, `screenshot`, `click`, `type`, `scroll`, `get_tabs`, `switch_tab`, `close_tab`, `evaluate`, `get_page_info`, `fill_form`, `press_key`, `extract_text`, `get_links`, `get_interactive_elements`, `click_by_text`, `type_by_label`, `export_markdown`, `read_pdf`, `manage_cookies`, `get_history`, `manage_downloads`, `get_bookmarks`, `highlight_element`

#### Setup-Prozess
1. `npm install -g mcp-chrome-bridge` (Node.js + npm erforderlich)
2. Chrome Extension aus Chrome Web Store installieren
3. Bridge-Prozess starten: `mcp-chrome-bridge`
4. MCP-Client konfigurieren
- **Komplexität:** Mittel — benötigt Node.js, npm-Paket, separater Bridge-Prozess
- **Setup-Dauer:** ~5-10 Minuten

#### Pricing/Modell
- **Open Source** (MIT) — kostenlos
- Keine Premium/Pro-Version
- Community-gesteuert

#### Schwächen
- **Node.js-Abhängigkeit** — Erheblicher Setup-Overhead vs. unser `python3 relay.py`
- **Größere Extension** — ~500KB vs. unsere ~50KB
- **Bridge-Prozess** — Zusätzlicher npm-Prozess, der laufen muss
- **Keine Recording/Playback** — Keine Aktionen-Aufzeichnung
- **Keine Form-Detection** — Kein automatisches Formular-Erkennen
- **Keine Batch-Execution** — Kein sequentielles Ausführen mehrerer Tools
- **Keine Console/Network-Capture** — Kein Debug-Insight
- **Komplexere Architektur** — Mehr bewegliche Teile = mehr Fehlerquellen

---

### 2. Web MCP (Chrome Web Store)

**Chrome Web Store:** https://chromewebstore.google.com/detail/web-mcp-browser-mcp-servi/acdlpjcmkabbmhpibedepbfdankiagoc  
**Nutzer:** ~2.000  
**Lizenz:** Proprietär (kostenlos)

#### Features, die WIR NICHT haben
- **Integrierter MCP-Server in der Extension** — Kein separater relay.py-Prozess nötig; WebSocket-Server läuft direkt in der Extension (Service Worker)
- **Auto-Reconnect** — Automatische Verbindungswiederherstellung bei Abbruch
- **Connection Status UI** — Detailliertes UI mit Verbindungsstatus, letzter Aktivität, Tool-Liste
- **MCP-Client-Auto-Discovery** — Extension kann sich selbst im lokalen Netzwerk ankündigen (mDNS/Zeroconf)
- **Tab-Snapshots** — Kompletter Tab-Zustand als Snapshot speichern und wiederherstellen

#### Tools
~18 Tools: `navigate`, `screenshot`, `click`, `type`, `scroll`, `get_tabs`, `switch_tab`, `close_tab`, `evaluate`, `get_page_info`, `fill_form`, `press_key`, `extract_text`, `get_links`, `get_dom`, `get_cookies`, `set_cookie`, `get_storage`

#### Setup-Prozess
1. Extension aus Chrome Web Store installieren (1-Klick)
2. Extension starten
3. MCP-Client konfigurieren (WebSocket-URL)
- **Komplexität:** Niedrig — kein separater Prozess nötig
- **Setup-Dauer:** ~2-3 Minuten

#### Pricing/Modell
- **Kostenlos** (proprietary)
- Keine Open-Source-Quelle verfügbar
- Keine API-Kosten

#### Schwächen
- **Proprietär** — Geschlossen, keine Community-Beiträge möglich
- **Keine Recording/Playback** — Keine Aktionen-Aufzeichnung
- **Keine Form-Detection** — Keine automatische Formular-Erkennung
- **Kein Batch-Execute** — Keine sequentielle Ausführung
- **Keine Console/Network-Capture** — Kein Debugging-Support
- **Begrenzte Tools** — Weniger Tools als wir
- **Abhängigkeit vom Web Store** — Extension kann jederzeit entfernt werden
- **Kein `evaluate`-Sandboxing** — JavaScript wird unsicher ausgeführt

---

### 3. AgentHub (Chrome Web Store)

**Chrome Web Store:** AgentHub — AI Chat + MCP  
**Nutzer:** Schätzung ~1.000-5.000  
**Lizenz:** Proprietär (Freemium)

#### Features, die WIR NICHT haben
- **Integrierter AI-Chat** — Sidebar-Chat-Interface direkt in der Extension; kein separater MCP-Client nötig
- **Multi-Model-Support** — ChatGPT, Claude, Gemini, lokales Llama direkt in der Extension wählbar
- **API-Key-Management** — Eigene API-Keys hinterlegen für verschiedene AI-Provider
- **Chat-History** — Gesprächsverlauf wird lokal gespeichert
- **Prompt-Templates** — Vordefinierte Prompts für häufige Browser-Aufgaben ("Extrahiere alle Preise", "Fülle dieses Formular aus")
- **MCP-Server-Modus** — Kann gleichzeitig als MCP-Server für externe Clients dienen
- **Visual Grounding** — AI kann Screenshots analysieren und "visuell" klicken (Klick auf Pixel-Position statt CSS-Selector)
- **Workflow-Builder** — Visueller Drag-and-Drop-Editor für Browser-Automatisierungs-Workflows
- **Scheduled Tasks** — Zeitgesteuerte Browser-Aufgaben (z.B. "jeden Tag um 9 Uhr Preise prüfen")

#### Tools
~15 MCP Tools (ähnlich zu Standard): `navigate`, `click`, `type`, `screenshot`, `scroll`, `get_tabs`, `switch_tab`, `evaluate`, `get_page_info`, `fill_form`, `extract_text` + proprietäre Chat/Workflow-Tools

#### Setup-Prozess
1. Extension aus Chrome Web Store installieren
2. API-Key für AI-Provider hinterlegen (oder MCP-Modus nutzen)
3. Bei MCP-Modus: MCP-Client konfigurieren
- **Komplexität:** Niedrig bis Mittel (API-Key erforderlich für Chat-Modus)
- **Setup-Dauer:** ~3-5 Minuten

#### Pricing/Modell
- **Freemium** — Basis-Tools kostenlos
- **Pro-Version** — Erweiterte AI-Modelle, unbegrenzte Workflows, Scheduled Tasks
- Preisspanne: ~$5-15/Monat (geschätzt)
- API-Kosten beim Nutzer (OpenAI/Anthropic)

#### Schwächen
- **Proprietär & Freemium** — Nicht vollständig frei, Pro-Features kostenpflichtig
- **Abhängigkeit von API-Keys** — Für Chat-Modus externe API-Keys nötig
- **Keine echte Open-Source-Alternative** — Code nicht einsehbar
- **Privacy-Bedenken** — API-Anfragen gehen zu Cloud-Providern
- **Kein Recording/Playback** — Nicht verfügbar
- **Kein Batch-Execute** — Sequenzen nur über Workflow-Builder
- **Kein Zero-Dependency-Modell** — API-Keys & Cloud benötigt für volle Funktionalität
- **Überladen** — Viele Features = größere Extension, höhere Komplexität

---

### 4. Algonius Browser MCP (Chrome Web Store)

**Chrome Web Store:** Algonius Browser MCP  
**Nutzer:** Schätzung <1.000  
**Lizenz:** Proprietär

#### Features, die WIR NICHT haben
- **Headless-Modus** — Kann Tabs im Hintergrund ausführen (keine visuelle Störung)
- **Multi-Window-Support** — Mehrere Browser-Fenster gleichzeitig steuern
- **Proxy-Integration** — HTTP/SOCKS-Proxy pro Tab konfigurierbar
- **Geolocation-Spoofing** — Standort pro Tab setzen
- **User-Agent-Rotation** — User-Agent pro Tab ändern
- **Custom-Headers** — Eigene HTTP-Header pro Request setzen
- **Request-Interception** — Netzwerk-Anfragen abfangen, blockieren oder modifizieren
- **Response-Mocking** — API-Antworten mocken für Tests
- **Performance-Metrics** — Page Load Time, FCP, LCP, CLS, TTFB als MCP Tool

#### Tools
~20 Tools: Standard-Tools + `set_proxy`, `set_geolocation`, `set_user_agent`, `intercept_request`, `mock_response`, `get_performance_metrics`, `get_security_headers`, `manage_windows`

#### Setup-Prozess
1. Extension aus Chrome Web Store installieren
2. MCP-Client konfigurieren (WebSocket-URL)
3. Extension starten
- **Komplexität:** Niedrig
- **Setup-Dauer:** ~2-3 Minuten

#### Pricing/Modell
- **Kostenlos** (proprietary)
- Mögliche Premium-Features in Zukunft

#### Schwächen
- **Proprietär** — Geschlossen
- **Sehr geringe Nutzerbasis** — <1.000
- **Keine Open-Source-Community** — Keine Beiträge, keine Transparenz
- **Keine Recording/Playback** — Nicht verfügbar
- **Keine Form-Detection** — Nicht verfügbar
- **Komplexe Tools** — Proxy, Geolocation, Mocking sind Nischen-Features
- **Privacy-Fokus unklar** — Datenverarbeitung bei proprietärer Extension nicht nachvollziehbar

---

### 5. Playwright MCP

**Repository:** Offiziell/Community (mehrere Implementierungen)  
**Bekannteste:** @executeautomation/playwright-mcp-server, microsoft/playwright-mcp  
**Lizenz:** MIT (Open Source)

#### Features, die WIR NICHT haben
- **Headless-Browser** — Vollständiger Browser im Hintergrund, keine UI-Störung
- **Multi-Browser-Support** — Chromium, Firefox, WebKit (Safari-Engine) steuerbar
- **Multi-Context** — Mehrere Browser-Kontexte gleichzeitig (inkognito-ähnlich)
- **Device-Emulation** — Mobile Geräte simulieren (iPhone, iPad, Pixel, etc.)
- **Network-Mocking** — API-Routen mocken und abfangen
- **Video-Recording** — Session als Video aufzeichnen
- **Trace-Viewer** — Detaillierte Aufzeichnung mit Timeline, DOM-Snapshots, Screenshots pro Aktion
- **PDF-Export** — Seite als PDF exportieren
- **Auto-Waiting** — Automatisches Warten auf Elemente (sichtbar, enabled, stable)
- **iFrame-Support** — Vollständige iFrame-Interaktion (in, out, cross-origin)
- **File-Upload/Download** — Datei-Uploads und Downloads handhaben
- **Dialog-Handling** — alert(), confirm(), prompt() automatisch behandeln
- **Geolocation** — Standort setzen
- **Permissions** — Camera, Mic, Notifications pro Context erlauben/verbieten
- **Hover/Drag-Drop** — Maus-Hover und Drag-and-Drop
- **Doppelklick / Rechtsklick** — Vollständige Maus-Interaktionen
- **Accessibility-Tree** — Vollständiger Accessibility-Tree (AX API)
- **Locator-Strategies** — getByText, getByRole, getByLabel, getByPlaceholder, getByAltText

#### Tools
~10-15 Tools: `navigate`, `click`, `fill`, `screenshot`, `evaluate`, `get_text`, `get_html`, `hover`, `select_option`, `check`, `uncheck`, `choose_file`, `accept_dialog`, `dismiss_dialog`, `set_viewport_size`

#### Setup-Prozess
1. `npm install playwright` (oder `pip install playwright`)
2. `playwright install` (Browser-Binaries herunterladen, ~300MB)
3. MCP-Server konfigurieren
- **Komplexität:** Hoch — Node.js/Python + Playwright + Browser-Binaries
- **Setup-Dauer:** ~10-20 Minuten (inkl. Download)

#### Pricing/Modell
- **Open Source** (MIT/Apache) — kostenlos
- Browser-Binaries sind kostenlos (Chromium, Firefox, WebKit)
- Keine Premium-Version

#### Schwächen
- **Keine echte Sitzung** — Neuer Browser ohne Logins/Cookies; nicht der echte Nutzer-Browser
- **300MB+ Setup** — Sehr groß vs. unsere ~60KB
- **Node.js/Python-Abhängigkeit** — Playwright muss installiert werden
- **Keine echte Browser-Erweiterung** — Headless oder headed, aber nicht als Extension
- **Keine Tab-Verwaltung** — Tabs existieren nicht im selben Sinne
- **Keine Cookie/Session-Nutzung** — Alles frisch, keine angemeldeten Dienste
- **Schwerer Einstieg** — Viel Konfiguration nötig
- **Kein Recording/Playback im MCP-Sinne** — Video-Recording ja, aber nicht als MCP-Tool-Sequenz
- **Kein Form-Detection** — Kein automatisches Formular-Erkennen

---

### 6. Browser Use for AI Agents (Chrome Web Store)

**Chrome Web Store:** Browser Use for AI Agents  
**Nutzer:** Schätzung ~500-2.000  
**Lizenz:** Proprietär / Open Source (gemischt)

#### Features, die WIR NICHT haben
- **Visual AI Grounding** — AI sieht den Screenshot und "versteht" die Seite visuell; klickt auf Pixel-Positionen statt CSS-Selectors
- **Self-Healing Selectors** — Wenn ein CSS-Selector nicht mehr funktioniert, findet die AI automatisch ein alternatives Element basierend auf visuellen/textuellen Merkmalen
- **Multi-Step-Reasoning** — AI plant mehrschrittige Aktionen autonom ("Gehe zu Amazon, suche 'Laptop', sortiere nach Preis, extrahiere die 5 günstigsten")
- **Error-Recovery** — Automatisches Wiederholen bei Fehlern mit alternativen Strategien
- **Page-Understanding** — AI analysiert die gesamte Seite und gibt eine semantische Zusammenfassung ("Diese Seite hat ein Anmeldeformular oben links, ein Karussell in der Mitte, und ein Footer mit Links")
- **Autonomous-Mode** — AI führt komplexe Aufgaben völlig selbstständig aus
- **Goal-Based-Execution** — Nutzer gibt ein Ziel ("Buche einen Flug nach Tokyo"), AI findet selbst den Weg
- **Action-History mit Reasoning** — Jede Aktion wird mit Begründung protokolliert ("Ich klicke hier, weil...")

#### Tools
~12 Tools: `navigate`, `click_at`, `type_at`, `screenshot`, `analyze_page`, `execute_goal`, `get_element_by_description`, `scroll_to_element`, `wait_for_element`, `get_page_summary`

#### Setup-Prozess
1. Extension aus Chrome Web Store installieren
2. AI-API-Key hinterlegen (OpenAI/Claude)
3. Ziel eingeben oder MCP-Client verbinden
- **Komplexität:** Mittel — API-Key erforderlich
- **Setup-Dauer:** ~3-5 Minuten

#### Pricing/Modell
- **Freemium** — Basis-Tools kostenlos
- **Pro** — Erweiterte AI-Modelle, Autonomous-Mode
- API-Kosten beim Nutzer
- Preisspanne: ~$10-20/Monat (geschätzt)

#### Schwächen
- **API-Abhängigkeit** — Funktioniert nicht ohne externe AI-API
- **Privacy** — Screenshots werden an Cloud gesendet für visuelle Analyse
- **Langsam** — Jede Aktion erfordert Screenshot-Analyse durch AI
- **Teuer** — API-Kosten pro Aktion (viele Token)
- **Kein echter MCP-Server** — Fokus auf eigene AI-Ausführung, nicht auf MCP-Protokoll
- **Keine Tab-Verwaltung** — Begrenzte Tab-Tools
- **Keine Recording/Playback** — Nicht verfügbar
- **Kein Batch-Execute** — Nur sequentiell mit AI-Reasoning dazwischen
- **Unzuverlässig** — Visuelles Klicken ist fehleranfällig bei dynamischen Seiten
- **Proprietär** — Kern-Logik nicht einsehbar

---

## Vergleichende Feature-Matrix

| Feature | BrowserMCP (wir) | mcp-chrome | Web MCP | AgentHub | Algonius | Playwright MCP | Browser Use |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Basis-Navigation** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CSS-Selector-Klick** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Text-basiertes Klicken** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Screenshot** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DOM/Accessibility-Tree** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Form-Management** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Form-Detection** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Tab-Verwaltung** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Recording/Playback** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Batch-Execute** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Console-Logs** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Network-Capture** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **JavaScript-Eval** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Element-Highlighting** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Markdown-Export** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PDF-Reader** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Cookie-Management** | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Downloads** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **History** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Bookmarks** | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Auto-Wait** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **iFrame-Support** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Hover/Drag-Drop** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **File-Upload** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Dialog-Handling** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Multi-Browser** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Device-Emulation** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Video-Recording** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Trace-Viewer** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Proxy-Support** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Integrierter AI-Chat** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Visual Grounding** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Self-Healing Selectors** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Auto-Reconnect** | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Zero-Dependency** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Echte Sitzung** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Open Source** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Setup-Komplexität** | Niedrig | Mittel | Niedrig | Mittel | Niedrig | Hoch | Mittel |
| **Tool-Anzahl** | 25 | 20+ | ~18 | ~15 | ~20 | ~15 | ~12 |

---

## Feature-Priorisierungstabelle

> **Machbarkeit** bezieht sich auf unsere Architektur (Chrome Extension MV3 + relay.py + WebSocket).  
> **Priorität** basiert auf AI-Automation-Nutzen und Wettbewerbsvorteil.  
> **Aufwand** ist eine Grobschätzung in Entwickler-Stunden.

### Priorität: Hoch 🔴

| # | Feature | Konkurrenten | Machbar? | Priorität | Aufwand (Std) | Begründung |
|---|---------|-------------|:---:|:---:|:---:|---|
| 1 | **Text-basiertes Klicken & Tippen** ("click the 'Submit' button") | mcp-chrome, Playwright, Browser Use | Ja | Hoch | 6-8 | Massive UX-Verbesserung für AI; AI muss keine CSS-Selector erraten, sondern kann natürliche Sprache nutzen. Reduziert Token-Verbrauch und Fehlerquote. |
| 2 | **Interaktive Element-Liste mit IDs** ("Element #5 ist der Submit-Button") | mcp-chrome | Ja | Hoch | 4-6 | AI kann Elemente per ID referenzieren statt komplexer Selectoren. Kombiniert mit `get_dom` sehr mächtig. |
| 3 | **Auto-Wait (auf Element warten)** | Playwright, Browser Use | Ja | Hoch | 3-4 | AI ruft `click` auf, Element existiert noch nicht → Auto-Wait löst das. Aktuell müssen AI-Agenten `wait` + Retry schleppen. |
| 4 | **Element-Highlighting** (visuelles Feedback) | mcp-chrome, Browser Use | Ja | Hoch | 2-3 | Roter Rahmen um das Element, das die AI gerade bearbeitet — unverzichtbar für Debugging und Nutzer-Vertrauen. Trivial zu implementieren. |
| 5 | **Markdown-Export der Seite** | mcp-chrome | Ja | Hoch | 4-5 | Strukturiertes Markdown ist für AI viel besser verarbeitbar als Raw-DOM. Tabellen, Listen, Überschriften werden semantisch erfasst. |
| 6 | **Hover & Drag-and-Drop** | Playwright, Browser Use | Ja | Hoch | 3-4 | Viele Web-Apps haben Hover-Menüs, Drag-Sortierung, etc. Ohne diese Tools ist AI dort blind. |

### Priorität: Mittel 🟡

| # | Feature | Konkurrenten | Machbar? | Priorität | Aufwand (Std) | Begründung |
|---|---------|-------------|:---:|:---:|:---:|---|
| 7 | **Cookie-Management** (lesen/schreiben) | mcp-chrome, Web MCP, Playwright | Ja | Mittel | 3-4 | Nützlich für Session-Verwaltung und AI-gesteuerte Auth-Flows. Chrome Extension API bietet `chrome.cookies`. |
| 8 | **iFrame-Interaktion** | Playwright | Ja | Mittel | 6-8 | Viele Seiten (Payment, Captcha, embedded Content) nutzen iFrames. Aktuell können wir nur das Top-Level-DOM sehen. |
| 9 | **File-Upload/Download** | Playwright | Ja | Mittel | 4-5 | Upload von Dateien (z.B. CV auf Jobportal) und Download-Handling. Über `chrome.downloads` API machbar. |
| 10 | **Dialog-Handling** (alert/confirm/prompt) | Playwright | Ja | Mittel | 2-3 | AI muss `alert()` und `confirm()` Dialoge akzeptieren/ablehnen können. `chrome.debugger` API oder JS-Override. |
| 11 | **Page-Load-Performance-Metriken** (FCP, LCP, CLS, TTFB) | Algonius, Playwright | Ja | Mittel | 2-3 | Performance API ist im Browser verfügbar. Hilfreich für Web-Vitals-Monitoring durch AI. |
| 12 | **History-Zugriff** | mcp-chrome | Ja | Mittel | 2-3 | AI kann "gehe zurück zur Seite von vor 3 Schritten" ausführen. `chrome.history` API. |
| 13 | **Tab-Snapshots** (Zustand speichern/wiederherstellen) | Web MCP | Teilweise | Mittel | 8-10 | Komplex mit MV3, aber extrem wertvoll für "Undo" bei AI-Fehlern. Teilweise machbar (Scroll-Position, URL, Form-Daten). |
| 14 | **Auto-Reconnect** (WebSocket-Wiederverbindung) | Web MCP, AgentHub | Ja | Mittel | 2-3 | Wenn die Verbindung abbricht, automatisch wieder verbinden. Verbessert Zuverlässigkeit erheblich. |
| 15 | **Request-Interception/Blocking** | Algonius, Playwright | Teilweise | Mittel | 6-8 | Via `chrome.debugger` API möglich. AI kann Ads blocken, Analytics-Requests filtern. Komplex in MV3. |
| 16 | **User-Agent-Switching** | Algonius, Playwright | Teilweise | Mittel | 3-4 | Via `chrome.debugger` oder `navigator.userAgent` Override. Nützlich für Mobile/Desktop-Tests. |

### Priorität: Niedrig 🟢

| # | Feature | Konkurrenten | Machbar? | Priorität | Aufwand (Std) | Begründung |
|---|---------|-------------|:---:|:---:|:---:|---|
| 17 | **Bookmark-Verwaltung** | mcp-chrome | Ja | Niedrig | 2-3 | `chrome.bookmarks` API vorhanden, aber geringer AI-Automation-Wert. |
| 18 | **PDF-Reader** | mcp-chrome, Playwright | Teilweise | Niedrig | 6-8 | PDF.js einbetten. Aufwendig und Nischen-Feature. |
| 19 | **Geolocation-Spoofing** | Algonius, Playwright | Teilweise | Niedrig | 3-4 | `chrome.debugger` API. Nischen-Use-Case. |
| 20 | **Multi-Window-Steuerung** | Algonius, Playwright | Ja | Niedrig | 4-5 | `chrome.windows` API vorhanden, aber geringer praktischer Nutzen für AI. |
| 21 | **Device-Emulation** | Playwright | Teilweise | Niedrig | 4-6 | Via Viewport-Resize + User-Agent. Playwright macht das besser. |
| 22 | **Video-Recording der Session** | Playwright | Teilweise | Niedrig | 8-10 | `chrome.tabCapture` API kann Video aufzeichnen. Sehr aufwendig, hoher Storage-Bedarf. |
| 23 | **Integrierter AI-Chat** | AgentHub, Browser Use | Nein | Niedrig | 20+ | Geht gegen unsere Philosophie (MCP-Server, nicht AI-Client). Sehr hoher Aufwand. |
| 24 | **Visual AI Grounding** (Pixel-basiertes Klicken) | AgentHub, Browser Use | Nein | Niedrig | 20+ | Erfordert AI-Model-Integration in Extension. Gegen unsere Zero-Dependency-Philosophie. |
| 25 | **Scheduled Tasks** (Zeitsteuerung) | AgentHub | Ja | Niedrig | 4-5 | `chrome.alarms` API. Nützlich, aber nicht Kern-Funktionalität für MCP. |
| 26 | **Trace-Viewer** (Timeline mit DOM-Snapshots) | Playwright | Nein | Niedrig | 20+ | Sehr komplex, wäre eigene UI. Nicht mit unserer Minimal-Architektur vereinbar. |
| 27 | **Multi-Browser-Support** (Firefox/Safari) | Playwright | Nein | Niedrig | 50+ | Wir sind eine Chrome Extension. Anderer Ansatz als Playwright. |
| 28 | **Self-Healing Selectors** | Browser Use | Teilweise | Niedrig | 10+ | Erfordert Fuzzy-Matching + AI-Reasoning. Sehr komplex. |

---

## Empfohlene Roadmap

### Phase 1: Quick Wins (1-2 Sprints, ~25 Std)

Features, die mit minimalem Aufwand maximalen Wettbewerbsvorteil schaffen:

| Priorität | Feature | Aufwand | Wert |
|:---:|---------|:---:|---|
| 🔴 1 | **Element-Highlighting** | 2-3 Std | Visuelles Feedback, sofortiger "Wow"-Effekt, Differenzierung |
| 🔴 2 | **Auto-Wait (auf Element warten)** | 3-4 Std | Reduziert AI-Retry-Schleifen massiv, bessere Erfolgsquote |
| 🔴 3 | **Interaktive Element-Liste mit IDs** | 4-6 Std | AI kann Elemente per ID referenzieren — Game-Changer für AI-Usability |
| 🔴 4 | **Hover & Drag-and-Drop** | 3-4 Std | Erschließt Hover-Menüs, Sortables, Slider, etc. |
| 🔴 5 | **Text-basiertes Klicken** | 6-8 Std | Natürlich-sprachliche Element-Referenzierung |
| 🟡 6 | **Dialog-Handling** | 2-3 Std | alert/confirm/prompt automatisieren |
| 🟡 7 | **Auto-Reconnect** | 2-3 Std | Zuverlässigkeit erhöhen |

**Geschätzter Gesamtaufwand Phase 1:** ~22-31 Std

### Phase 2: AI-Power-Features (2-3 Sprints, ~20 Std)

| Priorität | Feature | Aufwand | Wert |
|:---:|---------|:---:|---|
| 🔴 1 | **Markdown-Export der Seite** | 4-5 Std | AI-verständliches Seiten-Format |
| 🟡 2 | **Cookie-Management** | 3-4 Std | Session/Auth-Kontrolle für AI |
| 🟡 3 | **File-Upload/Download** | 4-5 Std | Upload-Automatisierung |
| 🟡 4 | **History-Zugriff** | 2-3 Std | Navigation-Back-Funktion |
| 🟡 5 | **Performance-Metriken** | 2-3 Std | Web-Vitals-Monitoring |
| 🟡 6 | **iFrame-Interaktion** | 6-8 Std | Payment/Captcha/embedded Content |

**Geschätzter Gesamtaufwand Phase 2:** ~21-28 Std

### Phase 3: Advanced (optional, ~20 Std)

| Priorität | Feature | Aufwand | Wert |
|:---:|---------|:---:|---|
| 🟡 1 | **Request-Interception** | 6-8 Std | Ad-Blocking, API-Mocking |
| 🟡 2 | **Tab-Snapshots** | 8-10 Std | Undo/Redo für AI-Aktionen |
| 🟡 3 | **User-Agent-Switching** | 3-4 Std | Mobile/Desktop-Tests |
| 🟢 4 | **Bookmark-Verwaltung** | 2-3 Std | Nischen-Feature |

**Geschätzter Gesamtaufwand Phase 3:** ~19-25 Std

---

## Zusammenfassung

### Unsere Alleinstellungsmerkmale (USPs)
1. ✅ **Zero Dependencies** — Einziges Produkt ohne npm/Node/Playwright
2. ✅ **Recording/Playback** — Kein Konkurrent bietet dies im MCP-Kontext
3. ✅ **Batch-Execute** — Kein Konkurrent bietet dies als MCP-Tool
4. ✅ **Form-Detection** — Kein Konkurrent erkennt Formulare automatisch
5. ✅ **Console/Network-Capture** — Kein direkter MCP-Konkurrent bietet dies
6. ✅ **Open Source + Zero-Setup** — Beste Kombination aus Freiheit und Einfachheit

### Größte Lücken (Features die Konkurrenten haben, wir nicht)
1. ❌ **Text-basierte Element-Referenzierung** — mcp-chrome, Playwright, Browser Use
2. ❌ **Element-Highlighting** — mcp-chrome, Browser Use
3. ❌ **Auto-Wait** — Playwright, Browser Use
4. ❌ **Markdown-Export** — mcp-chrome
5. ❌ **Hover/Drag-Drop** — Playwright, Browser Use
6. ❌ **Cookie-Management** — mcp-chrome, Web MCP, Playwright
7. ❌ **iFrame-Support** — Playwright
8. ❌ **File-Upload/Download** — Playwright

### Was wir NICHT tun sollten
- ❌ **Integrierter AI-Chat** — Gegen unsere MCP-Server-Philosophie
- ❌ **Visual AI Grounding** — Erfordert Cloud-AI, bricht Privacy-Versprechen
- ❌ **Multi-Browser-Support** — Wir sind eine Chrome Extension, kein Playwright
- ❌ **Trace-Viewer** — Zu komplex für Minimal-Architektur
- ❌ **Video-Recording** — Zu aufwendig, geringer Nutzwert

### Empfohlene Gesamtaufwand für Feature-Parität
- **Phase 1 (Quick Wins):** ~25 Std → Schließt die wichtigsten Lücken
- **Phase 2 (AI-Power):** ~25 Std → Vollständige Competitive Parity
- **Phase 3 (Advanced):** ~20 Std → Überflügelt mcp-chrome in Feature-Tiefe
- **Gesamt:** ~70 Std für vollständige Feature-Parität mit allen Konkurrenten

---

*Diese Analyse basiert auf öffentlich verfügbaren Informationen (GitHub READMEs, Chrome Web Store Listings, Tool-Dokumentationen) sowie der Code-Basis von BrowserMCP v0.2.0. Stand: Juli 2026.*