#!/usr/bin/env python3
"""Set one cut's state in videos/releases/STATUS.json and refresh its file facts.

Usage: scripts/status.py v0.1.12-en-16x9 <queued|rendering|review|passed|failed> [review note]
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS = os.path.join(HERE, "STATUS.json")
cut, state = sys.argv[1], sys.argv[2]
note = sys.argv[3] if len(sys.argv) > 3 else None
v = cut.split("-")[0]
path = os.path.join(HERE, v, "renders", f"aidr-{cut}.mp4")

rows = json.load(open(STATUS)) if os.path.exists(STATUS) else []
row = next((r for r in rows if r["cut"] == cut), None)
if row is None:
    row = {"cut": cut}
    rows.append(row)
row.update(state=state, path=path)
if note is not None:
    row["review"] = note
if os.path.exists(path) and state not in ("queued", "rendering"):
    probe = lambda *a: subprocess.run(["ffprobe", "-v", "error", *a, path], capture_output=True, text=True).stdout.strip()
    w, h = probe("-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0").split(",")
    row["res"] = f"{w}x{h}"
    row["duration"] = round(float(probe("-show_entries", "format=duration", "-of", "csv=p=0")), 2)
    row["sizeMB"] = round(os.path.getsize(path) / 1e6, 1)
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    row["lufs"] = float(m[-1]) if m else None
    tiktok = path.replace(".mp4", "-tiktok.mp4")
    if os.path.exists(tiktok):
        row["tiktok"] = {"path": tiktok, "sizeMB": round(os.path.getsize(tiktok) / 1e6, 1)}
    x = path.replace(".mp4", "-x.mp4")
    if os.path.exists(x):
        row["social"] = {"x": {"path": x, "sizeMB": round(os.path.getsize(x) / 1e6, 1)}}
json.dump(rows, open(STATUS, "w"), indent=2, ensure_ascii=False)
print(f"{cut}: {state}")
