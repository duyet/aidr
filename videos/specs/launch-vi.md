# Spec: Launch, Vietnamese cut

Status: planned. A version of the approved launch film, not a new film.

## Brief

```yaml
---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "<fill: the launch message, in Vietnamese>"
destination: youtube
aspect: 1920x1080
language: vi
audience: "Vietnamese readers who follow AI"
length: 30s
angle: "One Semicolon — same storyboard as the launch film"
narration: no
---
```

Follow-on versions: 1080x1920 and 1080x1080.

## Inputs

- The approved `videos/aidr-launch/STORYBOARD.md` and its frames.
- Live capture of `https://aidr.today/?lang=vi`.
- The day's `bullets_vi` (and `bullets_en` for the one English moment), saved under `data/`.
- Vietnamese-capable faces: the staged EB Garamond and Source Sans 3 Vietnamese subsets; Be Vietnam Pro from `apps/web/public/fonts/` for heavy headlines.
- The launch film's music.

## Beats

Same seven frames and the same bar grid as `launch.md` (4+4+4+4+4+6+4 s). Changes only:

| Frame | Change |
|-------|--------|
| 1, 2, 3, 4, 6 | Vietnamese copy from `bullets_vi` and the Vietnamese site |
| 5 Two tongues | Vietnamese leads; English is the other-language moment |
| 7 Lockup | Closing line in Vietnamese: `<fill: the site's Vietnamese tagline, from the capture>` |

## Done when

- No headline was translated by hand: every Vietnamese line is a stored `bullets_vi` value or text captured from the Vietnamese site.
- Diacritics render in every face at every size (check the contact sheet).
- Longer Vietnamese lines still fit; no clipped or overflowing text.
- `lint` and `check` pass; the owner approved the preview before render.
