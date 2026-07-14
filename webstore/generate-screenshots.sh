#!/bin/bash
# ═══════════════════════════════════════════════════════════
# BrowserMCP — Screenshot & Promo Generator
# Konvertiert HTML-Templates zu PNG-Screenshots
# ═══════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

# Output directories
mkdir -p screenshots promo

# Detect available browser
BROWSER=""
if command -v google-chrome-stable &>/dev/null; then
  BROWSER="google-chrome-stable"
elif command -v google-chrome &>/dev/null; then
  BROWSER="google-chrome"
elif command -v chromium &>/dev/null; then
  BROWSER="chromium"
elif command -v chromium-browser &>/dev/null; then
  BROWSER="chromium-browser"
else
  echo "❌ Kein Chrome/Chromium gefunden!"
  echo "   Installieren Sie Chrome oder verwenden Sie die manuelle Methode."
  echo "   Siehe webstore/README.md für Alternativen."
  exit 1
fi

echo "🌐 Browser gefunden: $BROWSER"
echo ""

# Screenshot sizes (width height)
declare -A SIZES
SIZES["screenshot1-popup"]="1280 800"
SIZES["screenshot2-ai-demo"]="1280 800"
SIZES["screenshot3-architecture"]="1280 800"
SIZES["screenshot4-tools"]="1280 800"
SIZES["screenshot5-setup"]="1280 800"
SIZES["small-promo-440x280"]="440 280"
SIZES["large-promo-920x680"]="920 680"
SIZES["marquee-promo-1400x560"]="1400 560"

# Generate screenshots
echo "📸 Generiere Screenshots..."
for template in screenshot-templates/*.html; do
  name=$(basename "$template" .html)
  size="${SIZES[$name]}"
  if [ -z "$size" ]; then
    # Default to 1280x800
    w=1280; h=800
  else
    w=$(echo $size | cut -d' ' -f1)
    h=$(echo $size | cut -d' ' -f2)
  fi
  output="screenshots/${name}.png"
  echo "   → $output (${w}×${h})"
  "$BROWSER" --headless --disable-gpu --no-sandbox \
    --screenshot="$output" \
    --window-size="${w},${h}" \
    --default-background-color=00000000 \
    "file://$(pwd)/$template" 2>/dev/null || true
done

# Generate promo tiles
echo "🎨 Generiere Promo-Tiles..."
for template in promo-templates/*.html; do
  name=$(basename "$template" .html)
  size="${SIZES[$name]}"
  if [ -z "$size" ]; then
    w=1280; h=800
  else
    w=$(echo $size | cut -d' ' -f1)
    h=$(echo $size | cut -d' ' -f2)
  fi
  output="promo/${name}.png"
  echo "   → $output (${w}×${h})"
  "$BROWSER" --headless --disable-gpu --no-sandbox \
    --screenshot="$output" \
    --window-size="${w},${h}" \
    --default-background-color=00000000 \
    "file://$(pwd)/$template" 2>/dev/null || true
done

echo ""
echo "✅ Fertig! Screenshots in: screenshots/"
echo "✅ Fertig! Promo-Tiles in: promo/"
echo ""
echo "📊 Übersicht:"
ls -lh screenshots/ promo/ 2>/dev/null || echo "   (Keine Dateien generiert — Browser-Fehler prüfen)"