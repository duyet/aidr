---
workflow: product-launch-video
storyboard: no
message: "v0.1.17: story links open on the first tap. Four changes, each shown as a part of the AI;DR machine beside the real screen."
destination: youtube (16:9 video, 9:16 Short), release page hero
aspect: 1920x1080 and 1080x1920 (rendered at 1080p on a low-memory Linux host)
language: en, vi
length: 36.5s
narration: no (music and effects only; the ElevenLabs quota was used up)
---

## Intent

The release film for aidr.today v0.1.17 (range `web-v0.1.16..web-v0.1.17`, release-please PR #1071). It reuses the v0.1.16 template: each highlight is one station of the launch film's machine, beside a real capture of the live surface. `build.mjs` gained a music-only mode. When `film.json` has no `voice`, each section's length comes from `durations` and each tag's `at` is seconds into its scene.

## Highlights (copy from `apps/web/src/content/releases/v0.1.17.ts`)

| # | Station | Capture | Grounding |
|---|---|---|---|
| 1 | Fetch, clock dial | `/release#algorithm` (first entry) | #1075 |
| 2 | TL;DR press, Aa plate | `/release#algorithm` | #1074 |
| 3 | Dispatch, web port | story page `/698114b6` | #1072, #1073 |
| 4 | Dispatch, Telegram port | Telegram post 257 (@aidr_today), 392 (@aihomnay) | #1078 |

Not in the film: robots.txt (#1069) and the new-tab extension (#1060, #1068). The extension is not on the Chrome Web Store yet.

## Build

```bash
export PATH=/usr/lib/jellyfin-ffmpeg:$PATH   # any ffmpeg on PATH
PUPPETEER_CORE=<puppeteer-core entry> CHROME=<chrome binary> node v0.1.17/capture.mjs
node v0.1.17/build.mjs && node v0.1.17/build.mjs --lang vi
```
