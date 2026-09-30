# Spec: Feature release

Status: planned. One feature per video.

## Brief

```yaml
---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "<fill: what the viewer can now do, in one sentence>"
destination: <fill: youtube | x-feed | shorts>
aspect: <fill: 1920x1080 | 1080x1080 | 1080x1920>
language: en
audience: "<fill: who this feature is for>"
length: <fill: 15s–20s>
angle: "<fill: the one moment that shows the feature working>"
narration: no
---
```

## Inputs

- The changelog entry for the feature (`apps/web/CHANGELOG.md`).
- A capture of the page where the feature lives.
- Real data from the live site for anything shown on screen, saved under `data/`.
- `videos/brand/frame.md`, `videos/brand/assets/`.

## Beats

120 BPM, one bar = 2s. 16s version:

| # | Beat | Length | On screen |
|---|------|--------|-----------|
| 1 | Open | 2s | The semicolon, then "New" and the feature's name |
| 2 | What you can do now | 4s | The outcome in the viewer's words, as type |
| 3 | Show it | 6s | The real interface doing it, camera on the one element that changed |
| 4 | Lockup | 4s | Logo, the closing line, aidr.today |

For 20s, give beat 3 two more bars.

## Done when

- The video shows the feature working on the real interface, not a description of it.
- The outcome lands before the interface appears.
- Only one feature is on screen.
- `lint` and `check` pass; the owner approved the preview before render.
