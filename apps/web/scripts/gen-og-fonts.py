#!/usr/bin/env python3
"""Rebuild the story OG card fonts from the full EB Garamond variable font.

The card is drawn by satori/resvg, which only shapes glyphs present in the
font it is given. The file previously committed as `eb-garamond-500.ttf` was
a Latin cut: it had no horned letters and no Vietnamese tone block, so the
renderer fetched a fallback face for those characters. EB Garamond itself
covers Vietnamese. These outputs are the full face, instanced at wght 500
and 700, with no subset.

Source: Google Fonts `ofl/ebgaramond` variable font. The URL tracks `main`,
so a regeneration is not byte-stable.

    python3 -m pip install fonttools brotli
    python3 apps/web/scripts/gen-og-fonts.py
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:
    sys.exit("fonttools is required: python3 -m pip install fonttools brotli")

SOURCE_URL = (
    "https://github.com/google/fonts/raw/main/ofl/ebgaramond/"
    "EBGaramond%5Bwght%5D.ttf"
)
FAMILY = "EB Garamond"
VIETNAMESE = (
    "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ"
    "ẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼ"
    "ỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ"
    "àáâãèéêìíòóôõùúăđĩũơư"
    "ạảấầẩẫậắằẳẵặẹẻẽềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ"
)
WEIGHTS = {500: "Medium", 700: "Bold"}
FONT_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"
CACHE = Path(__file__).resolve().parent / ".eb-garamond-source.ttf"


def fetch() -> Path:
    if CACHE.exists():
        return CACHE
    print(f"fetching {SOURCE_URL}")
    with urllib.request.urlopen(SOURCE_URL) as response:  # noqa: S310
        CACHE.write_bytes(response.read())
    return CACHE


def set_names(font: TTFont, subfamily: str) -> None:
    name = font["name"]
    full = f"{FAMILY} {subfamily}"
    ps = f"EBGaramond-{subfamily}"
    for pid, eid, lid in ((3, 1, 0x409), (1, 0, 0)):
        name.setName(FAMILY, 1, pid, eid, lid)
        name.setName(subfamily, 2, pid, eid, lid)
        name.setName(full, 4, pid, eid, lid)
        name.setName(ps, 6, pid, eid, lid)
        name.setName(FAMILY, 16, pid, eid, lid)
        name.setName(subfamily, 17, pid, eid, lid)


def build(source: Path, weight: int, subfamily: str) -> Path:
    font = instancer.instantiateVariableFont(
        TTFont(source), {"wght": weight}, inplace=False
    )
    for tag in ("fvar", "gvar", "HVAR", "MVAR", "avar", "STAT"):
        if tag in font:
            del font[tag]
    set_names(font, subfamily)
    font["OS/2"].usWeightClass = weight
    out = FONT_DIR / f"eb-garamond-{weight}.ttf"
    font.save(out)
    return out


def verify(path: Path) -> None:
    font = TTFont(path)
    covered: set[int] = set()
    for table in font["cmap"].tables:
        covered |= set(table.cmap)
    missing = [c for c in VIETNAMESE if ord(c) not in covered]
    if missing:
        raise SystemExit(f"{path.name} is missing Vietnamese: {''.join(missing)}")
    if "fvar" in font:
        raise SystemExit(f"{path.name} is still a variable font")
    print(
        f"{path.name}  {path.stat().st_size:>8} bytes  "
        f"{len(covered)} codepoints  {font['name'].getDebugName(1)!r} "
        f"{font['name'].getDebugName(2)!r}"
    )


def main() -> None:
    source = fetch()
    for weight, subfamily in WEIGHTS.items():
        verify(build(source, weight, subfamily))
    print(f"Vietnamese coverage: {len(VIETNAMESE)}/{len(VIETNAMESE)}")


if __name__ == "__main__":
    main()
