"""Draw the AI;DR app icons and launch logo from the site's vector wordmark.

    CHROME_BIN=/path/to/chrome python3 apps/ios/scripts/make-app-icon.py

The wordmark is the outlined path in apps/web/public/favicon.svg (the same
mark as the site's apple-touch-icon), so the app and the site never drift.
Headless Chrome rasterizes it. Writes:

- AppIcon.appiconset: AppIcon.png (yellow tile, warm gradient), AppIcon-Dark.png
  (the site header's yellow pill on warm black), AppIcon-Tinted.png,
  1024x1024 RGB with no alpha, as App Store Connect requires. iOS masks the
  corners itself, so the tiles are full bleed.
- LaunchLogo.imageset: the rounded yellow tile at 1x, 2x and 3x.
"""

import os
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ios = Path(__file__).resolve().parent.parent
repo = ios.parent.parent
favicon = (repo / "apps/web/public/favicon.svg").read_text()
PATH_D = re.search(r' d="([^"]+)"', favicon).group(1)
# The path's own box in favicon units (cap height 22.2..91, comma to 106.5).
X0, X1, CAP0, CAP1 = 2.5, 257.9, 22.2, 91.0
ASSETS = ios / "AIDR/Resources/Assets.xcassets"
CHROME = os.environ.get("CHROME_BIN") or "google-chrome"

INK = "#1c1917"  # favicon wordmark ink


def wordmark(size, width_share, cx, cy):
    """The transform that centers the wordmark at (cx, cy), width_share wide."""
    scale = size * width_share / (X1 - X0)
    tx = cx - (X1 - X0) * scale / 2 - X0 * scale
    ty = cy - (CAP0 + CAP1) / 2 * scale
    return f"translate({tx:.2f} {ty:.2f}) scale({scale:.5f})"


YELLOW = (
    '<linearGradient id="y" x1="0" y1="0" x2="0.35" y2="1">'
    '<stop offset="0" stop-color="#ffe27a"/><stop offset="0.5" stop-color="#f5c518"/>'
    '<stop offset="1" stop-color="#e8a500"/></linearGradient>'
)


def light_icon(s):
    """Yellow tile with soft top light and the wordmark casting a warm shadow."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}"><defs>{YELLOW}'
        '<radialGradient id="h" cx="0.25" cy="0.08" r="0.75">'
        '<stop offset="0" stop-color="#fff" stop-opacity="0.38"/>'
        '<stop offset="0.6" stop-color="#fff" stop-opacity="0"/></radialGradient>'
        '<filter id="s" x="-20%" y="-20%" width="140%" height="160%">'
        f'<feDropShadow dx="0" dy="{s * 0.013:.1f}" stdDeviation="{s * 0.016:.1f}" '
        'flood-color="#5a3a00" flood-opacity="0.32"/></filter></defs>'
        f'<rect width="{s}" height="{s}" fill="url(#y)"/><rect width="{s}" height="{s}" fill="url(#h)"/>'
        f'<path filter="url(#s)" fill="{INK}" transform="{wordmark(s, 0.7, s / 2, s / 2)}" d="{PATH_D}"/></svg>'
    )


def dark_icon(s, tile="#0c0b09", top="#2a2620", pill=None, ink=INK):
    """Warm black tile with the site header's yellow AI;DR pill floating on it."""
    pill_fill = pill or "url(#y)"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}"><defs>{YELLOW}'
        '<linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">'
        f'<stop offset="0" stop-color="{top}"/><stop offset="1" stop-color="{tile}"/></linearGradient>'
        '<filter id="s" x="-30%" y="-30%" width="160%" height="170%">'
        f'<feDropShadow dx="0" dy="{s * 0.021:.1f}" stdDeviation="{s * 0.025:.1f}" '
        'flood-color="#000" flood-opacity="0.55"/></filter></defs>'
        f'<rect width="{s}" height="{s}" fill="url(#g)"/>'
        f'<rect filter="url(#s)" x="{s * 0.14:.1f}" y="{s * 0.33:.1f}" width="{s * 0.72:.1f}" '
        f'height="{s * 0.34:.1f}" rx="{s * 0.075:.1f}" fill="{pill_fill}"/>'
        f'<path fill="{ink}" transform="{wordmark(s, 0.56, s / 2, s / 2)}" d="{PATH_D}"/></svg>'
    )


def launch_tile(w, h, factor):
    """The site's 160x48 rounded logo tile (apps/extension/icons/logo.svg)."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><defs>{YELLOW}</defs>'
        f'<rect width="{w}" height="{h}" rx="{10 * factor}" fill="url(#y)"/>'
        f'<path fill="{INK}" transform="{wordmark(w, 0.66, w / 2, h / 2)}" d="{PATH_D}"/></svg>'
    )


def render(markup, width, height, out, alpha):
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "icon.html"
        page.write_text(
            "<html><body style='margin:0;background:transparent'>" + markup + "</body></html>"
        )
        shot = Path(tmp) / "shot.png"
        subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
             "--default-background-color=00000000", # Headless Chrome's viewport is shorter than its window; pad and crop.
             f"--window-size={width},{height + 400}",
             f"--screenshot={shot}", page.as_uri()],
            check=True, capture_output=True,
        )
        image = Image.open(shot).crop((0, 0, width, height))
        image = image.convert("RGBA" if alpha else "RGB")
        out.parent.mkdir(parents=True, exist_ok=True)
        image.save(out)
        print(out, image.size, image.mode)


icons = ASSETS / "AppIcon.appiconset"
render(light_icon(1024), 1024, 1024, icons / "AppIcon.png", alpha=False)
render(dark_icon(1024), 1024, 1024, icons / "AppIcon-Dark.png", alpha=False)
# Tinted: iOS recolors a grayscale image; light pill and ink cut-out on dark.
tinted = icons / "AppIcon-Tinted.png"
render(dark_icon(1024, tile="#101010", top="#2a2a2a", pill="#e6e6e6", ink="#141414"), 1024, 1024, tinted, alpha=False)
Image.open(tinted).convert("L").convert("RGB").save(tinted)

launch = ASSETS / "LaunchLogo.imageset"
for factor in (1, 2, 3):
    w, h = 160 * factor, 48 * factor
    suffix = "" if factor == 1 else f"@{factor}x"
    render(launch_tile(w, h, factor), w, h, launch / f"LaunchLogo{suffix}.png", alpha=True)
