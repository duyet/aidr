#!/usr/bin/env bash
# Render every built cut of one release film in 4K into <v>/renders/, plus 1080p cover stills and
# 1080x1920 TikTok-ready copies of the 9:16 cuts (under 28 MB, H.264 High, AAC 128k).
#
# Usage: scripts/render.sh v0.1.12 [en|vi|en:9x16 ...]   (default: en vi; lang:ratio renders one shape)
#
# Run scripts/build.mjs first. Output names: aidr-<v>-<lang>-<16x9|9x16>.mp4, -cover.png, -tiktok.mp4.
# The English 16:9 master is the <v>/ project; the other cuts live in <v>-9x16/, <v>-vi/, <v>-vi-9x16/.
set -euo pipefail
cd "$(dirname "$0")/.."
v="$1"; shift
langs=("$@")
[[ ${#langs[@]} -eq 0 ]] && langs=(en vi)
out="$v/renders"
mkdir -p "$out"
for spec in "${langs[@]}"; do
  lang="${spec%%:*}"; ratios=(16x9 9x16); [[ "$spec" == *:* ]] && ratios=("${spec#*:}")
  suffix=""; [[ "$lang" != en ]] && suffix="-$lang"
  for ratio in "${ratios[@]}"; do
    dir="$v$suffix"; [[ "$ratio" == 9x16 ]] && dir="$v$suffix-9x16"
    [[ -f "$dir/index.html" ]] || continue
    name="aidr-$v-$lang-$ratio"
    res=landscape-4k; size=1920:1080
    [[ "$ratio" == 9x16 ]] && res=portrait-4k && size=1080:1920
    (cd "$dir" && npx --yes hyperframes@0.8.96 render --skill=product-launch-video --resolution "$res" --quality high --output "../$out/$name.mp4" --quiet >/dev/null)
    ffmpeg -v error -y -ss 3.0 -i "$out/$name.mp4" -frames:v 1 -vf "scale=$size:flags=lanczos" "$out/$name-cover.png"
    if [[ "$ratio" == 9x16 ]]; then
      # Two-pass to a bitrate that lands under 28 MB for the film's length.
      dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$name.mp4")
      kbps=$(python3 -c "print(int(25.5*8*1000/$dur - 128))")
      log="$out/$name-2pass"
      ffmpeg -v error -y -i "$out/$name.mp4" -vf scale=1080:1920:flags=lanczos -c:v libx264 -profile:v high -preset slow -b:v "${kbps}k" -pass 1 -passlogfile "$log" -an -f mp4 /dev/null
      ffmpeg -v error -y -i "$out/$name.mp4" -vf scale=1080:1920:flags=lanczos -c:v libx264 -profile:v high -preset slow -b:v "${kbps}k" -pass 2 -passlogfile "$log" \
        -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k "$out/$name-tiktok.mp4"
      rm -f "$log"*
    fi
    echo "$name $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$name.mp4")s"
  done
done
