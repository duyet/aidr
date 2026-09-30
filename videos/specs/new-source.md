# Spec: New source

Status: planned. Announces a source newly added to the pipeline, such as arXiv.

## Brief

```yaml
---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "<fill: AI;DR now reads <source>, so you do not have to>"
destination: <fill: shorts | x-feed | youtube>
aspect: <fill: 1080x1920 | 1080x1080 | 1920x1080>
language: en
audience: "<fill: readers who care about this source>"
length: <fill: 10s–15s>
angle: "<fill: what this source adds to the digest>"
narration: no
---
```

## Inputs

- The source's entry under `apps/web/worker/sources/`.
- Two or three sample headlines from that source, taken from the live site and saved under `data/`.
- The source's own logo, only from its official source and only if its use is allowed; otherwise its name in type.
- `videos/brand/frame.md`, `videos/brand/assets/`.

## Beats

120 BPM, one bar = 2s. 12s version:

| # | Beat | Length | On screen |
|---|------|--------|-----------|
| 1 | Open | 2s | The semicolon, then "New source" |
| 2 | The name | 2s | The source's name, large |
| 3 | What it adds | 4s | Sample headlines from that source landing as ranked rows |
| 4 | Lockup | 4s | Logo, the closing line, aidr.today |

## Done when

- Every sample headline is a real item from that source, present in `data/`.
- The source is named exactly as it names itself.
- `lint` and `check` pass; the owner approved the preview before render.
