#!/usr/bin/env bash
# Loudness-normalize a render in place to -16 LUFS integrated, -1 dBTP (two-pass loudnorm), video stream copied.
# Usage: scripts/master.sh renders/promo-chrome-ext-16x9.mp4
set -euo pipefail
in="$1"
m=$(ffmpeg -hide_banner -i "$in" -af loudnorm=I=-16:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
v() { echo "$m" | sed -n "s/.*\"$1\" : \"\(.*\)\".*/\1/p"; }
tmp="${in%.mp4}.master.mp4"
ffmpeg -v error -y -i "$in" -c:v copy -af "loudnorm=I=-16:TP=-1:LRA=11:measured_I=$(v input_i):measured_TP=$(v input_tp):measured_LRA=$(v input_lra):measured_thresh=$(v input_thresh):offset=$(v target_offset):linear=true" -ar 48000 -c:a aac -b:a 256k "$tmp"
mv "$tmp" "$in"
ffmpeg -hide_banner -i "$in" -af ebur128 -f null - 2>&1 | grep -E '^\s+I:' | tail -1
