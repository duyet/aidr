# Spec: Story clip

Status: planned. Nothing is built. Read `videos/docs/story-clips-plan.md` first; it lists decisions the owner has not made yet.

Unlike the other series, this is one fixed template rendered many times with different variables. There is no interview and no per-clip storyboard.

## Brief (for building the template once)

```yaml
---
workflow: <fill: decided when the template is built>
flow: automation
storyboard: yes
message: "<fill per clip: the story's headline>"
destination: shorts
aspect: 1080x1920
language: <fill per clip: en | vi>
audience: "Followers of AI;DR's social channels"
length: <fill: 8s–12s, fixed once chosen>
angle: "One story, stated once, with its rank and source"
narration: no
---
```

Follow-on version: 1080x1080.

## Inputs (per clip)

| Variable | From |
|----------|------|
| `headline` | The stored bullet text, unchanged |
| `category` | The story's category |
| `source` | The source name |
| `rank` | Its position in the digest |
| `date` | The edition date |
| `lang` | `en` or `vi` |
| `thumbnail` | The story image, or none |

## Beats

120 BPM, one bar = 2s. 8s version:

| # | Beat | Length | On screen |
|---|------|--------|-----------|
| 1 | Open | 2s | The semicolon; rank and category label |
| 2 | The headline | 4s | The headline lands, a marker highlight on its key name; source and date beneath |
| 3 | Lockup | 2s | Logo and aidr.today |

## Done when

- The same variables render the same video.
- The template works with no thumbnail, and with the longest stored headline in either language.
- The output passes the existing Telegram preflight: MP4, at most 20 MB.
- No model call happens at render time.
