"""Measure each hero screenshot: size and the yellow date header's box (sun #F5C518 within a tolerance).
Writes data/shots.json, which scripts/build.mjs reads to align the match cuts on the header.
Usage: python3 -I scripts/shots.py"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
out = {}
for f in sorted((ROOT / "assets/shots").glob("*.webp")):
    im = Image.open(f).convert("RGB")
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if abs(r - 0xF5) < 24 and abs(g - 0xC5) < 24 and b < 70:
                xs.append(x)
                ys.append(y)
    rows = sorted(set(ys))
    # The header is the tallest run of yellow rows; the "Get AI;DR" chip and tag text are short runs.
    best, run = [], [rows[0]]
    for a, b in zip(rows, rows[1:]):
        run = run + [b] if b - a <= 2 else [b]
        if len(run) > len(best):
            best = list(run)
    top, bottom = best[0], best[-1]
    hx = [x for x, y in zip(xs, ys) if top <= y <= bottom]
    out[f.stem] = {"w": w, "h": h, "header": [min(hx), top, max(hx) - min(hx), bottom - top]}
(ROOT / "data/shots.json").write_text(json.dumps(out, indent=2) + "\n")
print(json.dumps(out))
