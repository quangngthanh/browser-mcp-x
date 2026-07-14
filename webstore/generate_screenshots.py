#!/usr/bin/env python3
"""Generate screenshots from HTML templates using headless Chromium."""
import subprocess
import os
import sys

WEBSTORE = os.path.dirname(os.path.abspath(__file__))
BROWSER = "/usr/bin/chromium"

TEMPLATES = {
    "screenshot-templates/screenshot1-popup.html": ("screenshots/screenshot1-popup.png", "1280", "800"),
    "screenshot-templates/screenshot2-ai-demo.html": ("screenshots/screenshot2-ai-demo.png", "1280", "800"),
    "screenshot-templates/screenshot3-architecture.html": ("screenshots/screenshot3-architecture.png", "1280", "800"),
    "screenshot-templates/screenshot4-tools.html": ("screenshots/screenshot4-tools.png", "1280", "800"),
    "screenshot-templates/screenshot5-setup.html": ("screenshots/screenshot5-setup.png", "1280", "800"),
    "promo-templates/small-promo-440x280.html": ("promo/small-promo-440x280.png", "440", "280"),
    "promo-templates/large-promo-920x680.html": ("promo/large-promo-920x680.png", "920", "680"),
    "promo-templates/marquee-promo-1400x560.html": ("promo/marquee-promo-1400x560.png", "1400", "560"),
}

os.makedirs(os.path.join(WEBSTORE, "screenshots"), exist_ok=True)
os.makedirs(os.path.join(WEBSTORE, "promo"), exist_ok=True)

for template, (output, w, h) in TEMPLATES.items():
    template_path = os.path.join(WEBSTORE, template)
    output_path = os.path.join(WEBSTORE, output)
    url = f"file://{template_path}"
    
    print(f"  → {output} ({w}×{h})")
    
    cmd = [
        BROWSER, "--headless", "--disable-gpu", "--no-sandbox",
        "--screenshot=" + output_path,
        "--window-size=" + w + "," + h,
        "--default-background-color=00000000",
        "--hide-scrollbars",
        url
    ]
    
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    if result.returncode != 0:
        print(f"    ⚠ Warning: {result.stderr.decode()[:200]}")
    
    if os.path.exists(output_path):
        size = os.path.getsize(output_path)
        print(f"    ✓ Generated ({size} bytes)")
    else:
        print(f"    ✗ Failed")

print("\nDone!")