"""Diff each <name>-site.png against <name>-newtab.png in a folder.

Writes <name>-side.png (site left, new tab right), <name>-overlay.png
(50/50 blend) and prints, per 100px band, the share of pixels that differ.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

BAND = 100
THRESHOLD = 24  # per-channel delta below this counts as equal (antialiasing)


def band_report(site, tab):
    diff = ImageChops.difference(site, tab).convert("L")
    mask = diff.point(lambda v: 255 if v > THRESHOLD else 0)
    width, height = mask.size
    bands = []
    for top in range(0, height, BAND):
        box = (0, top, width, min(top + BAND, height))
        hist = mask.crop(box).histogram()
        share = hist[255] / ((box[2] - box[0]) * (box[3] - box[1]))
        bands.append({"y": top, "diff": round(share, 3)})
    total = mask.histogram()[255] / (width * height)
    return round(total, 3), bands


def main(folder):
    out = Path(folder)
    summary = {}
    for site_path in sorted(out.glob("*-site.png")):
        name = site_path.name.removesuffix("-site.png")
        site = Image.open(site_path).convert("RGB")
        tab = Image.open(out / f"{name}-newtab.png").convert("RGB")
        if tab.size != site.size:
            tab = tab.resize(site.size)
        side = Image.new("RGB", (site.width * 2 + 8, site.height), "red")
        side.paste(site, (0, 0))
        side.paste(tab, (site.width + 8, 0))
        side.save(out / f"{name}-side.png")
        Image.blend(site, tab, 0.5).save(out / f"{name}-overlay.png")
        total, bands = band_report(site, tab)
        summary[name] = {
            "diff": total,
            "bands": [b for b in bands if b["diff"] > 0.02],
        }
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
