#!/usr/bin/env python3
"""Check App Store screenshots before upload.

usage: check-screenshots.py <dir>

<dir> holds one folder per size class, named 6.3 (1206x2622 or 1179x2556) or
6.9 (1320x2868, 1290x2796 or 1260x2736). Each file is <lang>-<NN>-<slug>.png,
for example 6.3/en-01-today.png. See screenshots.md. Standard library only.

Checks: accepted pixel size for the folder, PNG without alpha channel or
tRNS chunk (Apple rejects transparency, source 17), at most 10 files per
language and size, the same shots in English and Vietnamese.
"""
import pathlib
import re
import struct
import sys

CLASSES = {"6.3": {(1206, 2622), (1179, 2556)}, "6.9": {(1320, 2868), (1290, 2796), (1260, 2736)}}
NAME = re.compile(r"^(en|vi)-(\d\d)-([a-z0-9-]+)\.png$")
errors = []


def png_info(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    width, height, _depth, ctype = struct.unpack(">IIBB", data[16:26])
    pos, trns = 8, False
    while pos + 8 <= len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        if data[pos + 4:pos + 8] == b"tRNS":
            trns = True
        pos += 12 + length
    return width, height, ctype in (4, 6) or trns


def main(root):
    root = pathlib.Path(root)
    found = 0
    for cls, sizes in CLASSES.items():
        folder = root / cls
        if not folder.is_dir():
            continue
        per_lang = {"en": set(), "vi": set()}
        for p in sorted(folder.iterdir()):
            m = NAME.match(p.name)
            if not m:
                errors.append(f"{p}: name must be <en|vi>-<NN>-<slug>.png")
                continue
            found += 1
            try:
                w, h, alpha = png_info(p)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{p}: {e}")
                continue
            if (w, h) not in sizes:
                errors.append(f"{p}: {w}x{h} is not accepted for {cls} (want one of {sorted(sizes)})")
            if alpha:
                errors.append(f"{p}: has an alpha channel or transparency; flatten it")
            per_lang[m.group(1)].add(m.group(2) + "-" + m.group(3))
        for lang, shots in per_lang.items():
            if len(shots) > 10:
                errors.append(f"{cls}/{lang}: {len(shots)} screenshots, maximum 10")
        if per_lang["en"] != per_lang["vi"]:
            diff = sorted(per_lang["en"] ^ per_lang["vi"])
            errors.append(f"{cls}: English and Vietnamese sets differ: {diff}")
        print(f"{cls}: en {len(per_lang['en'])}, vi {len(per_lang['vi'])}")
    if not found:
        errors.append("no screenshots found")
    for e in errors:
        print("FAIL", e)
    print("OK" if not errors else f"{len(errors)} problem(s)")
    sys.exit(1 if errors else 0)


if len(sys.argv) != 2:
    sys.exit(__doc__)
main(sys.argv[1])
