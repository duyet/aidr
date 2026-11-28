#!/usr/bin/env python3
"""Copy screenshots exported by `xcresulttool export attachments` to
<out>/<attachment name>.png, using the manifest the tool writes.

usage: export-screenshots.py <attachments dir> <out dir>
"""
import json
import pathlib
import re
import shutil
import sys

src, out = map(pathlib.Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=True)
manifest = json.loads((src / "manifest.json").read_text())
count = 0
for test in manifest:
    for a in test.get("attachments", []):
        exported = a["exportedFileName"]
        if not exported.lower().endswith((".png", ".jpeg", ".jpg", ".txt")):
            continue
        human = a.get("suggestedHumanReadableName") or exported
        # "today-vi_0_6F1C...png" -> "today-vi"
        name = re.sub(r"_\d+_[0-9A-Fa-f-]{36}$", "", pathlib.Path(human).stem)
        dest = out / f"{name}{pathlib.Path(exported).suffix}"
        shutil.copyfile(src / exported, dest)
        print(dest)
        count += 1
if count == 0:
    sys.exit("no screenshots in the result bundle")
