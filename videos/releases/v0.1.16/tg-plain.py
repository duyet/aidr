#!/usr/bin/env python3
"""Blank the header and per-story emoji in the Telegram captures (capture/tg-post-*.png ->
capture/tg-plain-*.png) so the film shows the plain format #948 shipped. No post in the new format
existed when the film was cut; this stands in until one does. Run after capture.mjs:
    python3 v0.1.16/tg-plain.py
Below the day card each paragraph (the header, then one per story) opens with one emoji in the
text column's first glyph slot; wrapped lines start in that same slot, so only first lines are blanked.
"""
from collections import Counter
from pathlib import Path

from PIL import Image

CAP = Path(__file__).parent / "capture"
for src in sorted(CAP.glob("tg-post-*.png")):
    if src.stem.endswith("-full"):
        continue
    im = Image.open(src).convert("RGB")
    px = im.load()
    W, H = im.size
    ink = lambda x, y: sum(px[x, y]) < 600
    starts = Counter(next((x for x in range(W) if ink(x, y)), None) for y in range(H // 2, H))
    starts.pop(None, None)
    left = starts.most_common(1)[0][0]
    slot = round(W * (0.0165 if W > H else 0.05))
    right = left + round(W * (0.2 if W > H else 0.6))
    on = [any(ink(x, y) for x in range(left, right, 2)) for y in range(H)] + [False]
    bands, a = [], None
    for y, v in enumerate(on):
        if v and a is None:
            a = y
        elif not v and a is not None:
            bands.append((a, y))
            a = None
    line = sorted(b - a for a, b in bands)[len(bands) // 2]
    card = max(i for i, (a, b) in enumerate(bands) if b - a > 3 * line)
    text = bands[card + 1 :]
    # Emoji fill runs of saturated pixels; the sub-pixel fringes on text are one or two wide.
    sat = lambda x, y: max(px[x, y]) - min(px[x, y]) > 100
    colour = lambda a, b: sum(all(sat(x + d, y) for d in range(4)) for y in range(a, b) for x in range(left, left + slot - 4)) > 0.02 * slot * (b - a)
    firsts = [text[0]] + [cur for prev, cur in zip(text, text[1:]) if cur[0] - prev[1] > line * 0.6 or colour(*cur)]
    bg = px[left - 10, text[0][0]]
    edge = max(x for a, b in text for y in range(a, b, 3) for x in range(left, W) if ink(x, y)) + 8
    for a, b in firsts:
        y0, y1 = a - 4, min(H, b + 4)
        # Slide the line left onto the column edge, as the plain format sets it.
        x0 = min((x for y in range(a, b) for x in range(left + slot, edge) if ink(x, y)), default=None)
        if x0 is None:  # a lone wrapped "→", not a paragraph opener
            continue
        row = im.crop((x0, y0, edge, y1))
        im.paste(Image.new("RGB", (edge - left + 4, y1 - y0), bg), (left - 4, y0))
        im.paste(row, (left, y0))
        px = im.load()
    dst = CAP / src.name.replace("tg-post", "tg-plain")
    im.save(dst)
    print(f"{dst.name}: blanked {len(firsts)} first glyphs at x={left}..{left + slot}, line {line}px")
