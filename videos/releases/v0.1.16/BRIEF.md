---
workflow: product-launch-video
storyboard: yes
message: "v0.1.16: one email, every story. Five fixes a reader notices, each shown as a part of the AI;DR machine beside the real screen."
destination: youtube (16:9 video, 9:16 Short), release page hero
aspect: 1920x1080 (rendered 3840x2160) and 1080x1920 (rendered 2160x3840)
language: en, vi
length: 45s (en), vi as the voice needs
narration: yes
---

## Intent

The release film for aidr.today v0.1.16 (range `web-v0.1.15..web-v0.1.16`, release-please PR #951). Owner rule for release films: 30–45 s, music bed, voice-over by the house cast, burned-in captions, motion design, anatomy-style isometric drawing, simple style (paper ground, one yellow accent per frame, brand fonts, nothing from the avoid list in `videos/brand/brand.md`).

Each highlight is one station of the launch film's machine (`videos/aidr-launch-2026/assets/machine.svg`, drawn with the anatomy kit in `aidr-launch-2026/machine/kit/`), framed by a camera that travels left to right along the bench, beside a real capture of the live surface it changed.

## Highlights (copy from `apps/web/src/content/releases/v0.1.16.ts`)

| # | Station | Capture | Grounding |
|---|---|---|---|
| 1 | Fetch, clock dial | `/data` (Pipeline, last run Healthy) | #1000, #997, #991, #1001, #958 |
| 2 | TL;DR press, VI plate | `/?lang=vi` | #959, #1025 |
| 3 | TL;DR press, a plate | day card 2026-10-21 (`/api/og/date/2026-10-21.png`) | #1026 |
| 4 | Dispatch, email port | email preview (`/api/subscribe/preview`) | #1003, #1004, #1005, #1006 |
| 5 | Dispatch, web port | RSS tab at /subscribe?tab=rss, live, 22 Oct | #1028 |
| 6 | Dispatch, Telegram port | Telegram post 193 (@aidr_today) and 329 (@aihomnay), 21 Oct | #952 |

Not in the film: Telegram plain headers (#948), the review rubrics and daily-video changes (#970–#972, #1020, #1024; cut for length).

The Telegram capture is the 21 Oct digest, the first after #952 deployed. It has six stories, not four or five; the picture shows every story listed, and the voice names the four- and five-story days the fix is about.

## Build

- `film.json`: copy, voice lines, captures, crops. The `vi` block overrides by field (scenes by index).
- `capture.mjs`: read-only captures of the live surfaces into ignored `capture/`.
- `build.mjs`: voice (ElevenLabs, cast from `videos/brand/voices.json`, seeded by the version, cached by text in ignored `assets/audio/voice/`), captions, the mix (News Theme bed from 16 s in, sidechain duck under the voice, effects placed by measured peaks, -14 LUFS), and all four projects.
- `timeline.js`: the one paused GSAP timeline, inlined by the build.
- Renders: `../scripts/render.sh v0.1.16` (now with `--workers 2`).

## Versions

- en 16:9 master: `v0.1.16/`; en 9:16: `v0.1.16-9x16/`; vi 16:9: `v0.1.16-vi/`; vi 9:16: `v0.1.16-vi-9x16/`. Each 9:16 is laid out again (header band, machine, window, caption), not cropped. Vietnamese copy comes from the release file's `vi` text and the Vietnamese captures.
