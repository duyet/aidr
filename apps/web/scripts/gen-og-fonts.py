#!/usr/bin/env python3
"""Rebuild the story OG card fonts from upstream Be Vietnam Pro.

The satori/resvg renderer shapes text only with the fonts the route hands it,
and it does not apply OpenType mark-to-base positioning. Source Sans 3 covers
the Vietnamese alphabet, but its stacked tones (ấ, ậ, ế, …) are composite
glyphs whose vertical offset lives only in GPOS. Without that lookup the tone
marks sit on the letter. Be Vietnam Pro is a humanist sans in the same family
as Source Sans 3, drawn for Vietnamese, and its stacked letters are already
simple outlines.

Source: the static Google Fonts builds (`ofl/bevietnampro`), weights 500 and
700. The script subsets those files; it does not instantiate a variable font.

Usage (from the repo root):
    python3 -m pip install fonttools brotli
    python3 apps/web/scripts/gen-og-fonts.py

NOT byte-reproducible. The upstream URLs track `main`, so a rerun can produce
different bytes. The committed TTFs are identified by hash.

A local cache under `scripts/.be-vietnam-pro/` (gitignored) is reused when
present, which is what makes a same-machine rerun stable.
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

try:
    from fontTools import subset
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover - setup guidance
    sys.exit("fonttools is required: python3 -m pip install fonttools brotli")

FAMILY = "Be Vietnam Pro"

# Stacked tone that used to render on the baseline when its GPOS offset was
# dropped. After subsetting it must still be a simple outline sitting above
# the cap height.
STACKED_MARK = 0x1EA5  # ấ

WEIGHTS = {
    500: (
        "Medium",
        "BeVietnamPro-Medium",
        "https://github.com/google/fonts/raw/main/ofl/bevietnampro/BeVietnamPro-Medium.ttf",
    ),
    700: (
        "Bold",
        "BeVietnamPro-Bold",
        "https://github.com/google/fonts/raw/main/ofl/bevietnampro/BeVietnamPro-Bold.ttf",
    ),
}

FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"
CACHE_DIR = Path(__file__).resolve().parent / ".be-vietnam-pro"

# Vietnamese is not one contiguous range:
#   U+0110-0111  D/d          -> Latin Extended-A
#   U+01A0-01A1  O/o (horn)   -> Latin Extended-B
#   U+01AF-01B0  U/u (horn)   -> Latin Extended-B
#   U+1EA0-1EF9  tone block   -> Latin Extended Additional
UNICODE_RANGES = [
    "U+0000-00FF",
    "U+0100-024F",
    "U+0300-036F",
    "U+1EA0-1EF9",
    "U+2000-206F",
    "U+20A0-20CF",
    "U+2100-214F",
    "U+2190-21FF",
    "U+2200-22FF",
    "U+FEFF",
    "U+FFFD",
]

LAYOUT_FEATURES = [
    "kern", "mark", "mkmk", "ccmp", "calt", "liga", "clig", "locl", "rlig",
]

VIETNAMESE = (
    "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ"
    "ẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼ"
    "ỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ"
    "àáâãèéêìíòóôõùúăđĩũơư"
    "ạảấầẩẫậắằẳẵặẹẻẽềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ"
)


def fetch_source(url: str, cache: Path) -> Path:
    if cache.exists():
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    print(f"fetching {url}")
    with urllib.request.urlopen(url) as response:  # noqa: S310
        cache.write_bytes(response.read())
    return cache


def set_names(font: TTFont, subfamily: str, ps_name: str) -> None:
    """The static Google Fonts files name the family 'Be Vietnam Pro Medium'.

    satori matches the `name` the route passes, which is the family without
    the weight. A name table that still says 'Medium' is a trap for the next
    reader, so both records are rewritten.
    """
    name = font["name"]
    full = f"{FAMILY} {subfamily}"
    for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
        name.setName(FAMILY, 1, pid, eid, lid)
        name.setName(subfamily, 2, pid, eid, lid)
        name.setName(full, 4, pid, eid, lid)
        name.setName(ps_name, 6, pid, eid, lid)
        name.setName(FAMILY, 16, pid, eid, lid)
        name.setName(subfamily, 17, pid, eid, lid)


def build(source: Path, weight: int, subfamily: str, ps_name: str) -> Path:
    font = TTFont(source)
    set_names(font, subfamily, ps_name)
    font["OS/2"].usWeightClass = weight
    # Medium stays a regular face; bold sets the bold style bit.
    if weight >= 700:
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b1000001) | 0b100000
        font["head"].macStyle = 1
    else:
        font["OS/2"].fsSelection = (font["OS/2"].fsSelection & ~0b100001) | 0b1000000
        font["head"].macStyle = 0

    options = subset.Options()
    options.layout_features = LAYOUT_FEATURES
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.glyph_names = True
    options.drop_tables += ["DSIG"]

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(" ".join(UNICODE_RANGES)))
    subsetter.subset(font)
    # Be Vietnam Pro has no arrow. Headlines do ("read more →"), and a missing
    # glyph makes satori fetch a fallback face for that one character.
    ensure_arrow(font)

    out = FONT_DIR / f"be-vietnam-pro-{weight}.ttf"
    font.save(out)
    return out


def ensure_arrow(font: TTFont) -> None:
    """Draw U+2192 as a simple outline when the source face has no arrow."""
    if 0x2192 in font.getBestCmap():
        return
    pen = TTGlyphPen(None)
    pen.moveTo((80, 300))
    pen.lineTo((560, 300))
    pen.lineTo((560, 380))
    pen.lineTo((80, 380))
    pen.closePath()
    pen.moveTo((470, 180))
    pen.lineTo((820, 340))
    pen.lineTo((470, 500))
    pen.closePath()
    name = "arrowright"
    glyf = font["glyf"]
    glyf.glyphs[name] = pen.glyph()
    if name not in glyf.glyphOrder:
        glyf.glyphOrder.append(name)
    font["hmtx"].metrics[name] = (900, 80)
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[0x2192] = name


def verify(path: Path) -> None:
    font = TTFont(path)
    codepoints: set[int] = set()
    for table in font["cmap"].tables:
        codepoints |= set(table.cmap)

    missing = [c for c in VIETNAMESE if ord(c) not in codepoints]
    if missing:
        raise SystemExit(f"{path.name} is missing Vietnamese: {''.join(missing)}")

    cmap = font.getBestCmap()
    glyph = font["glyf"][cmap[STACKED_MARK]]
    if glyph.isComposite() or glyph.yMax < 850:
        raise SystemExit(
            f"{path.name} ấ is still a GPOS-positioned composite "
            f"(composite={glyph.isComposite()} yMax={glyph.yMax}); "
            "the card renderer will draw the tone mark on the letter"
        )

    print(
        f"{path.name}  {path.stat().st_size:>7} bytes  "
        f"{len(codepoints)} codepoints  {font['maxp'].numGlyphs} glyphs  "
        f"{font['name'].getDebugName(1)!r} {font['name'].getDebugName(2)!r}"
    )


def main() -> None:
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    for weight, (subfamily, ps_name, url) in WEIGHTS.items():
        source = fetch_source(url, CACHE_DIR / f"{ps_name}.ttf")
        verify(build(source, weight, subfamily, ps_name))
    print(f"Vietnamese coverage: {len(VIETNAMESE)}/{len(VIETNAMESE)}")
    print("Regenerate the committed previews: render-og-preview.tsx all docs/assets")


if __name__ == "__main__":
    main()
