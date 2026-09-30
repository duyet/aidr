# Spec: Launch

Mirrors the real brief at `videos/aidr-launch/BRIEF.md`. Use it to regenerate the launch film or start a sibling.

## Brief

```yaml
---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Too much AI news; AI;DR ranks it down to the eight stories that matter, every day, in English and Vietnamese."
destination: youtube
aspect: 1920x1080
language: en
audience: "People who follow AI closely: builders, researchers, founders; English and Vietnamese readers"
length: 30s
angle: "One Semicolon — the semicolon is the product: noise on one side, the digest on the other"
narration: no
---
```

Follow-on versions: 1080x1920 and 1080x1080, laid out for their shape.

## Inputs

- Live capture of `https://aidr.today/?lang=en`.
- The day's `bullets_en` and `bullets_vi` from `https://aidr.today/api/public`, saved under `data/`.
- The story count shown on the site that day.
- `videos/brand/assets/logo.svg`, `videos/brand/frame.md`, `videos/brand/assets/fonts/`.
- Music: a short string ostinato, about 120 BPM, no brass.

## Beats

120 BPM, one bar = 2s. Every boundary sits on a bar line.

| # | Frame | Length | On screen |
|---|-------|--------|-----------|
| 1 | The semicolon | 4s | A lone ink semicolon blinks on yellow; "N AI stories today" types beside it |
| 2 | N becomes 8 | 4s | Through the semicolon's dot; a wall of real headlines; the counter drops to 8 |
| 3 | Marker pass | 4s | A highlighter runs through dense text; the marked words form the top headline |
| 4 | The digest | 4s | Eight ranked rows land on the beat as the real AI;DR card |
| 5 | Two tongues | 4s | Split at the semicolon; each headline in English and Vietnamese |
| 6 | New tab | 6s | A tab opens on the real interface; email 07:00, Telegram 08:00, RSS tick in |
| 7 | Lockup | 4s | Back into the semicolon; the logo assembles; "What's happening in AI today?" over aidr.today |

Total: 30s.

## Done when

- Every headline and figure on screen is in `data/`.
- The logo is drawn from its paths, never typed.
- `lint` and `check` pass; the contact sheet was inspected.
- The owner approved the preview before render.
- All three formats exist, each laid out for its shape.
