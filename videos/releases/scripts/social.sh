#!/usr/bin/env bash
# Write the phone-sendable social copy of one rendered cut (under 28 MB, H.264 High, AAC 128k,
# loudness kept at -14 LUFS): 16:9 → <name>-x.mp4 at 1920x1080 for X; 9:16 → <name>-tiktok.mp4 at
# 1080x1920 for TikTok, Reels and X vertical. Then refreshes STATUS.json.
#
# Usage: scripts/social.sh v0.1.12-en-16x9
set -euo pipefail
cd "$(dirname "$0")/.."
cut="$1"; v="${cut%%-*}"; src="$v/renders/aidr-$cut.mp4"
if [[ "$cut" == *16x9 ]]; then dst="${src%.mp4}-x.mp4"; size=1920:1080; else dst="${src%.mp4}-tiktok.mp4"; size=1080:1920; fi
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
kbps=$(python3 -c "print(int(25.5*8*1000/$dur - 128))")
log="$(mktemp -d)/2pass"
ffmpeg -v error -y -i "$src" -vf "scale=$size:flags=lanczos" -c:v libx264 -profile:v high -preset slow -b:v "${kbps}k" -pass 1 -passlogfile "$log" -an -f mp4 /dev/null
ffmpeg -v error -y -i "$src" -vf "scale=$size:flags=lanczos" -c:v libx264 -profile:v high -preset slow -b:v "${kbps}k" -pass 2 -passlogfile "$log" \
  -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "$dst"
python3 scripts/status.py "$cut" "$(python3 -c "import json;print(next(r['state'] for r in json.load(open('STATUS.json')) if r['cut']=='$cut'))")"
echo "$dst $(stat -f %z "$dst") bytes"
