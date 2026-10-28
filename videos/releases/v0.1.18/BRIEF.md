---
workflow: product-launch-video
storyboard: no
message: "v0.1.18: duplicate stories merge again. One fix, shown at the machine's dedupe and score stations beside the dated entry on /release."
destination: youtube (16:9 video, 9:16 Short), release page hero
aspect: 1920x1080 and 1080x1920 (rendered at 1080p on a low-memory Linux host)
language: en, vi
length: 22.5s
narration: no (music and effects only; the ElevenLabs quota is low)
---

## Intent

The release film for aidr.today v0.1.18 (range `web-v0.1.17..web-v0.1.18`, release-please PR #1082). It reuses the v0.1.17 template with two scenes instead of four, two new stations (`dedupe`, `score`), and larger header, tag and URL text. The `/release#algorithm` capture is taken at a 600 px desktop viewport so the 16:9 window shows the whole entry at a readable size instead of a cropped wide column.

## Highlights (copy from `apps/web/src/content/releases/v0.1.18.ts`)

| # | Station | Capture | Grounding |
|---|---|---|---|
| 1 | Dedupe, three copies fold into one | `/release#algorithm` (2026-10-28 entry) | #1081 |
| 2 | Score, gauge and plunger | `/release#algorithm` | #1081 |

Not in the film: dependency updates (@types/node 26, workflows on Node 26, cf beta.23). Nothing a reader sees.

## Build

```bash
export PATH=/usr/lib/jellyfin-ffmpeg:$PATH   # any ffmpeg on PATH
PUPPETEER_CORE=<puppeteer-core entry> CHROME=<chrome binary> node v0.1.18/capture.mjs
node v0.1.18/build.mjs && node v0.1.18/build.mjs --lang vi
```
