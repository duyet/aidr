# videos

Source for AI;DR's videos: the launch film, its language and format versions, and the series that follow. Videos are HTML compositions built with HyperFrames and rendered to MP4.

## Layout

| Path | What it holds |
|------|---------------|
| `brand/` | Shared brand facts (`brand.md`), the canonical design spec (`frame.md`), logo and fonts (`assets/`) |
| `docs/` | How a video is made (`workflow.md`), the series catalog (`series.md`), the per-story clip proposal (`story-clips-plan.md`) |
| `specs/` | One reusable brief template per series |
| `<project>/` | One folder per video, e.g. `aidr-launch/` |

## What is in git

Sources only. Output is regenerable and stays out.

| Tracked | Ignored (`videos/.gitignore`) |
|---------|-------------------------------|
| `BRIEF.md` — what the video is for | `capture/` — site captures, includes third-party news photos |
| `STORYBOARD.md` — the plan, frame by frame | `renders/` — MP4 output |
| `frame.md` — the design spec | `snapshots/` — contact sheets |
| `compositions/`, `index.html` — the video itself | `node_modules/` |
| `assets/` — staged fonts, logo, images | `.hyperframes/frame-packets/` |
| `data/` — the day's real headlines and counts | |

## Make a video

1. Use the `aidr-video` skill (`.agents/skills/aidr-video/`). It reads the brand, picks the series spec, and hands the build to the `hyperframes` skill.
2. The step-by-step pipeline and its gates are in [`docs/workflow.md`](docs/workflow.md).
3. Motion follows the `aidr-motion-designer` skill.
4. Every render is reviewed with the `aidr-video-review` skill before it is called done or posted. Nothing ships below 8/10.

To regenerate an existing video, open its folder: `BRIEF.md` and `STORYBOARD.md` are the full instructions. Do not re-interview.

## Series

| Series | Spec | Project | Status |
|--------|------|---------|--------|
| Launch | [`specs/launch.md`](specs/launch.md) | `aidr-launch/` | 16:9 master built (30.6s, voice, music, effects) |
| Launch, 9:16 (TikTok, Reels, Shorts) | [`specs/launch.md`](specs/launch.md) | `aidr-launch-9x16/` | Built; same timings and audio as the master, re-laid out per its `film-sheet.md` |
| Launch, Vietnamese cut | [`specs/launch-vi.md`](specs/launch-vi.md) | — | Planned |
| Feature release | [`specs/feature-release.md`](specs/feature-release.md) | — | Planned |
| New source | [`specs/new-source.md`](specs/new-source.md) | — | Planned |
| Daily Brief (top stories, every day, 16:9 + 9:16, 4K) | [`daily-news/README.md`](daily-news/README.md) | `daily-news/` | Template built; one edition per day under `daily-news/editions/<date>/`. Skill: `aidr-daily-news` |
| Story clip (automated, per news item) | [`specs/story-clip.md`](specs/story-clip.md) | — | Planned, see [`docs/story-clips-plan.md`](docs/story-clips-plan.md) |

Details per series: [`docs/series.md`](docs/series.md).
