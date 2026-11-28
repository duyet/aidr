"""Draw the AI;DR app icons and launch logo from the site's vector wordmark.

    CHROME_BIN=/path/to/chrome python3 apps/ios/scripts/make-app-icon.py

The wordmark is the outlined path in apps/web/public/favicon.svg (the same
mark as the site's apple-touch-icon), so the app and the site never drift.
Headless Chrome rasterizes it. Writes:

- AppIcon.appiconset: AppIcon.png (yellow), AppIcon-Dark.png, AppIcon-Tinted.png,
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

BRAND = "#f5c518"  # --brand
INK = "#1c1917"  # favicon wordmark ink


def svg(width, height, bg, ink, word_width, radius=0):
    """A tile with the wordmark centered: word_width is a share of width."""
    scale = width * word_width / (X1 - X0)
    tx = (width - (X1 - X0) * scale) / 2 - X0 * scale
    ty = height / 2 - (CAP0 + CAP1) / 2 * scale
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<rect width="{width}" height="{height}" rx="{radius}" fill="{bg}"/>'
        f'<path fill="{ink}" transform="translate({tx:.3f} {ty:.3f}) scale({scale:.5f})" d="{PATH_D}"/>'
        "</svg>"
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
# The wordmark spans 68% of the tile, like the site's apple-touch-icon.
render(svg(1024, 1024, BRAND, INK, 0.68), 1024, 1024, icons / "AppIcon.png", alpha=False)
render(svg(1024, 1024, "#141310", BRAND, 0.68), 1024, 1024, icons / "AppIcon-Dark.png", alpha=False)
tinted = icons / "AppIcon-Tinted.png"
render(svg(1024, 1024, "#1a1a1a", "#f2f2f2", 0.68), 1024, 1024, tinted, alpha=False)
Image.open(tinted).convert("L").convert("RGB").save(tinted)

# Launch logo: the site's 160x48 rounded tile (apps/extension/icons/logo.svg).
launch = ASSETS / "LaunchLogo.imageset"
for factor in (1, 2, 3):
    w, h = 160 * factor, 48 * factor
    suffix = "" if factor == 1 else f"@{factor}x"
    render(svg(w, h, BRAND, INK, 0.66, radius=10 * factor), w, h, launch / f"LaunchLogo{suffix}.png", alpha=True)
