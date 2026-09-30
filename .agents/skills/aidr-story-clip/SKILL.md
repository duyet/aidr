---
name: aidr-story-clip
description: Build or run the per-story auto video pipeline for AI;DR — a short branded clip rendered for each news item and attached to its social post. Use when the user asks for "a video per story", "auto video for Telegram posts", "clips for social auto-posting", or to work on videos/story-clip/. Status is planned; nothing is built yet.
---

# aidr-story-clip

**Status: planned. Nothing is built.** There is no template project, no render job, no storage and no notify change yet.

## Read first

1. `videos/docs/story-clips-plan.md` — the proposal, the phases, the risks, and the owner's open decisions.
2. `videos/specs/story-clip.md` — the template's brief, variables and beats.
3. `videos/brand/brand.md` and the `aidr-motion-designer` skill.
4. `apps/web/ALGORITHM.md` — before any change to ingest, ranking or notify.

## What to do, by phase

| Phase | Do | Stop and ask when |
|-------|-----|-------------------|
| 0 Template | Build `videos/story-clip/` with the `aidr-video` and `hyperframes` skills. Render a small batch by hand from one day's stored stories. Measure render time and file size. | The template needs a thumbnail to look right |
| 1 CI render + storage | Add the render job and the upload. | Before adding any storage binding or secret |
| 2 Telegram attach | Let the notifier use a ready first-party clip; otherwise keep today's path. Update `ALGORITHM.md` in the same change. | Any change to post timing |
| 3 Other platforms | Not startable: the API credentials do not exist. | Always |
| 4 Metrics | Compare posts with and without clips. | — |

Do not start a phase until the open decisions it depends on (listed in the plan) are answered.

## Rules

- **Read `apps/web/ALGORITHM.md` before touching notify**, and update it when notify behaviour changes.
- **Never delay a post and never double-post.** A missing or late clip falls back to the existing photo path, then text.
- **Stored bullets only.** No rewriting and no model call at render time.
- **Confirm with the owner** before adding storage, a new vendor, or posting credentials.
- The output must pass the existing Telegram video preflight: MP4, at most 20 MB, at most 300 s.
- The template must work with no thumbnail.
- Sources in git; rendered clips are never committed.
