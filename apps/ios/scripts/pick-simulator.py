#!/usr/bin/env python3
"""Print the UDID of the newest available iPhone simulator.

Reads `xcrun simctl list devices available -j` on stdin. Picks the highest iOS
runtime, then prefers a Pro iPhone (the 6.3 inch size the screenshots target).
"""
import json
import re
import sys


def runtime_version(key):
    m = re.search(r"iOS-(\d+)-(\d+)(?:-(\d+))?$", key)
    return tuple(int(x or 0) for x in m.groups()) if m else None


def rank(name):
    if re.fullmatch(r"iPhone \d+ Pro", name):
        return 0
    if re.fullmatch(r"iPhone \d+", name):
        return 1
    return 2


def main():
    devices = json.load(sys.stdin)["devices"]
    best = None
    for key, items in devices.items():
        version = runtime_version(key)
        if version is None:
            continue
        for d in items:
            if not d["name"].startswith("iPhone") or not d.get("isAvailable", True):
                continue
            gen = [int(x) for x in re.findall(r"\d+", d["name"])[:1]] or [0]
            score = (version, -rank(d["name"]), gen[0])
            if best is None or score > best[0]:
                best = (score, d)
    if best is None:
        sys.exit("no iPhone simulator available")
    d = best[1]
    print(f"{d['udid']}\t{d['name']}\tiOS {'.'.join(map(str, best[0][0]))}", file=sys.stderr)
    print(d["udid"])


main()
