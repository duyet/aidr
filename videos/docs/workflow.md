# Workflow: one video, start to finish

The `hyperframes` skill owns the build. This page is the AI;DR view of it: the order, the gates, and the problems already hit.

Run every command below from the project folder (`videos/<project>/`) once it exists.

## Steps

| # | Step | Output |
|---|------|--------|
| 1 | Intent and brief. Start from the series spec in `videos/specs/`. | A confirmed brief |
| 2 | `npx hyperframes init "videos/<project>" --non-interactive --example=blank --skill=product-launch-video` (from the repo root) | `hyperframes.json` |
| 3 | Write `BRIEF.md` right after init. Init refuses a non-empty folder. | `BRIEF.md` |
| 4 | `npx hyperframes capture "<URL>" -o ./capture --json` | `capture/` (ignored by git) |
| 5 | Save the day's real headlines and counts. | `data/` |
| 6 | Copy `videos/brand/frame.md` and `videos/brand/assets/fonts/` into the project. | `frame.md`, `assets/fonts/` |
| 7 | Storyboard: one frame per beat. | `STORYBOARD.md` |
| 8 | Audio: music, and narration if the brief has any. | `audio_meta.json` |
| 9 | Visual design: a time-coded shot sequence per frame, written into `STORYBOARD.md`. | Enriched `STORYBOARD.md` |
| 10 | Frames: one sub-agent per frame. | `compositions/frames/NN-*.html` |
| 11 | Assemble. | `index.html` |
| 12 | `npx hyperframes lint`, `npx hyperframes check`, `npx hyperframes snapshot` | Contact sheet in `snapshots/` |
| 13 | `npx hyperframes preview --background` | Studio preview |
| 14 | `npx hyperframes render --skill=product-launch-video --quality high --output renders/video.mp4` | `renders/` (ignored by git) |
| 15 | Review the render with the `aidr-video-review` skill. | A score and the top five fixes |

## Review after every render

Every render and re-render goes through `.agents/skills/aidr-video-review/`:

1. **Measure** the rendered file (the skill ships `scripts/motion_report.py`).
2. **Review** it against the storyboard, frame by frame.
3. **Fix the top five** issues it returns.
4. **Re-render only the affected section**, then review again.

Nothing ships below 8/10.

## Gates

- **The owner approves the plan** (the frame table from `STORYBOARD.md`) before frames are built.
- **The owner approves before render.** Checks passing is not approval.
- `lint` and `check` must pass before the preview is offered. If one fails, fix the frame and rerun that check.
- **A render scores at least 8/10** in `aidr-video-review` before it is called done or posted.

## Formats

Build the 16:9 master first (1920x1080). 9:16 (1080x1920) and 1:1 (1080x1080) are follow-on versions of the approved master, **laid out again for their shape**. They are not crops.

## Motion

Follow `.agents/skills/aidr-motion-designer/`.

## Known issues

- **Music needs a provider.** Library music needs a HeyGen sign-in: `npx hyperframes auth login`. The offline route is local MusicGen, which needs `pip install transformers torch soundfile numpy`. `npx hyperframes auth status` reports which one is available; it exits 1 when signed out, which is normal.
- **nvm shell functions.** On machines where `node` and `npx` are nvm shell functions, a non-interactive shell fails with `command not found: _load_nvm`. Call the real binaries instead (put the nvm `bin` directory on `PATH` and use `command node` / `command npx`).
- **The brand remix mis-maps.** `build-frame.mjs` picked the wrong accent and display font for AI;DR. Copy `videos/brand/frame.md` instead; see `videos/brand/brand.md`.
- **Capture has no vision captions** without a vision API key. Asset descriptions are then derived from filenames and page context only.
