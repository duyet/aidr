#!/usr/bin/env python3
"""Vertical metrics of the shipped web fonts, so the metric-matched fallback
`@font-face` overrides in `apps/web/src/fonts.css` are measured, not guessed.

Issue #229 gave the fallback faces the webfont's own ascent/descent/lineGap.
Those numbers are read out of the font binaries here, so a font upgrade that
changes them is caught by `apps/web/src/lib/fonts.test.ts` instead of silently
reintroducing the footer reflow.

    python3 apps/web/scripts/font-metrics.py \\
      node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2 \\
      node_modules/@fontsource-variable/source-sans-3/files/source-sans-3-vietnamese-wght-normal.woff2 \\
      node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2

A plain `.ttf` needs nothing but the standard library;
`apps/web/public/fonts/eb-garamond-500.ttf` is the cross-check for the
EB Garamond woff2 subset — both report unitsPerEm=1000, ascent=1007,
descent=298, lineGap=0. A `.woff2` needs the `brotli` module to decompress.

Only `head` and `hhea` are read. Both are tiny, untransformed tables with
fixed signatures, so they are located by signature rather than by walking the
transformed `glyf`/`loca` offsets, which is not reliable enough for a value
that ships in CSS.
"""
import struct
import sys

HEAD_MAGIC = b"\x5f\x0f\x3c\xf5"
HHEA_VERSION = b"\x00\x01\x00\x00"

# WOFF2 known-tag table, index 0-62 (WOFF2 spec, "Table Directory Format").
KNOWN_TAGS = [
    "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ",
    "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp",
    "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF",
    "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL",
    "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc",
    "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx",
    "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
]


def _base128(data, i):
    value = 0
    for _ in range(5):
        byte = data[i]
        i += 1
        value = (value << 7) | (byte & 0x7F)
        if not byte & 0x80:
            return value, i
    raise ValueError("bad UIntBase128")


def _woff2_sfnt(path):
    """Decompress a .woff2 container into its sfnt stream."""
    import brotli

    data = open(path, "rb").read()
    if data[:4] != b"wOF2":
        raise ValueError(f"{path}: not a WOFF2 container")
    num_tables = struct.unpack(">H", data[12:14])[0]
    total_compressed = struct.unpack(">I", data[20:24])[0]
    i = 48
    for _ in range(num_tables):
        flags = data[i]
        i += 1
        index = flags & 0x3F
        transform = (flags >> 6) & 0x03
        if index == 0x3F:
            # Unknown tag: a literal 4-byte tag follows. Its transform
            # version is always 0, so there is no transformLength to read.
            i += 4
            _orig_len, i = _base128(data, i)
            continue
        tag = KNOWN_TAGS[index]
        _orig_len, i = _base128(data, i)
        # transformLength is present only for a transformed table.
        if (tag in ("glyf", "loca") and transform == 0) or (
            tag in ("hmtx", "maxp") and transform == 1
        ) or (tag == "post" and transform == 2):
            _xform_len, i = _base128(data, i)
    return brotli.decompress(data[i : i + total_compressed])


def _ttf_tables(data):
    num_tables = struct.unpack(">H", data[4:6])[0]
    out = {}
    for i in range(num_tables):
        off = 12 + i * 16
        tag = data[off : off + 4].decode("latin-1")
        start, length = struct.unpack(">II", data[off + 8 : off + 16])
        out[tag] = data[start : start + length]
    return out


def metrics(path):
    if path.endswith(".woff2"):
        sfnt = _woff2_sfnt(path)
        at = sfnt.find(HEAD_MAGIC)
        if at < 12:
            raise ValueError(f"{path}: no head table")
        head = sfnt[at - 12 : at - 12 + 54]
        upem = struct.unpack(">H", head[18:20])[0]
        pos = 0
        hhea = None
        while True:
            pos = sfnt.find(HHEA_VERSION, pos)
            if pos < 0 or pos + 36 > len(sfnt):
                break
            ascent, descent, line_gap = struct.unpack(
                ">hhh", sfnt[pos + 4 : pos + 10]
            )
            num_hmetrics = struct.unpack(">H", sfnt[pos + 34 : pos + 36])[0]
            # Every text face has a real text line box: an ascender around
            # 0.6-1.5 em, a descender 0.1-0.8 em. This is what separates the
            # actual hhea from the many `0x00010000` byte sequences that
            # appear by chance inside a compressed glyf table.
            if (
                0.6 * upem < ascent < 1.5 * upem
                and 0.1 * upem < -descent < 0.8 * upem
                and 0 <= line_gap < 0.5 * upem
                and 0 < num_hmetrics < 20000
            ):
                hhea = (ascent, descent, line_gap)
                break
            pos += 1
        if hhea is None:
            raise ValueError(f"{path}: no plausible hhea table")
        ascent, descent, line_gap = hhea
    else:
        tables = _ttf_tables(open(path, "rb").read())
        head = tables["head"]
        upem = struct.unpack(">H", head[18:20])[0]
        ascent, descent, line_gap = struct.unpack(">hhh", tables["hhea"][4:10])
    return {
        "unitsPerEm": upem,
        "ascent": ascent,
        "descent": -descent,
        "lineGap": line_gap,
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    for path in sys.argv[1:]:
        try:
            m = metrics(path)
        except ImportError:
            print(f"{path}: needs `pip install brotli` (a .ttf does not)")
            continue
        upem = m["unitsPerEm"]
        print(f"{path.rsplit('/', 1)[-1]}")
        print(
            f"  unitsPerEm={upem} ascent={m['ascent']} descent={m['descent']} "
            f"lineGap={m['lineGap']}"
        )
        print(
            f"  -> ascent-override: {m['ascent'] / upem * 100:.2f}%;  "
            f"descent-override: {m['descent'] / upem * 100:.2f}%;  "
            f"line-gap-override: {m['lineGap'] / upem * 100:.2f}%;"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
