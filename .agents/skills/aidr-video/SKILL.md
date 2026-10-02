---
name: aidr-video
description: Make, regenerate, re-cut, translate, or re-format an AI;DR video. Use for any work under videos/ — a new video from a series spec (launch, Vietnamese cut, feature release, new source), rebuilding an existing project from its BRIEF.md and STORYBOARD.md, or adding a 9:16 / 1:1 / other-language version. Use when the user says "make a video", "regenerate the launch film", "Vietnamese version", "vertical version", "video for this feature", or "video for the new source".
---

# aidr-video

This skill is the AI;DR layer on top of HyperFrames. It says what to read, which spec to start from, and which rules are fixed for this repo. The `hyperframes` skill owns the actual build.

## Read, in this order

1. `videos/README.md` — the folder map and what is tracked.
2. `videos/brand/brand.md` — palette, type, logo rules, motifs, the avoid list.
3. The series spec in `videos/specs/` (`launch.md`, `launch-vi.md`, `feature-release.md`, `new-source.md`). Series overview: `videos/docs/series.md`.
4. `videos/docs/workflow.md` — step order, gates, known issues.
5. The `hyperframes` skill — then follow it.

For per-story automated clips, use the `aidr-story-clip` skill instead. For the daily top-stories news video (YouTube, TikTok, Reels, Facebook), use the `aidr-daily-news` skill.

## New video

1. Pick the series spec. Fill its `<fill>` fields from the request; ask only for what the request and the spec leave open.
2. Name the project in kebab-case under `videos/`, for example `videos/feature-mcp`.
3. Init, then write `BRIEF.md` from the filled spec as the first action after init.
4. Capture the page the video is about. Save the day's real headlines and counts under `data/`.
5. Copy `videos/brand/frame.md` to the project as `frame.md`, and `videos/brand/assets/fonts/` to `assets/fonts/`. Do not re-run the brand remix.
6. Hand over to the `hyperframes` skill for storyboard, frames, checks and preview.

## Regenerate an existing video

1. Read the project's `BRIEF.md` and `STORYBOARD.md`. They are the full instructions. **Do not re-interview.**
2. Refresh `data/` if the video should show today's edition; keep it if the video should match the original.
3. Rebuild the frames the change touches. Leave approved frames alone.
4. Run the checks and offer the preview.

## New format or language version

- A version follows the approved master. Same beats, same timing.
- **Format:** lay each frame out again for the new shape. Do not crop the master.
- **Language:** take copy from the stored edition in that language (`bullets_vi`, or the capture of `?lang=vi`). Do not translate headlines by hand.
- Keep the master project's brief; record the version in it rather than writing a second brief.

## Hard rules

- **Real data only.** Every headline and figure on screen is in the project's `data/`, taken from the live site or `https://aidr.today/api/public`.
- **Brand spec from `videos/brand/frame.md`.** The logo is animated from its outlined paths, never retyped.
- **Sources in git, output ignored.** `capture/`, `renders/` and `snapshots/` stay out of git (`videos/.gitignore`). Do not force-add them.
- **Never render without the owner's approval.** Passing checks is not approval.
- **Motion follows `aidr-motion-designer`.**
- **Every render is reviewed with `aidr-video-review`.** Nothing ships below 8/10.
- A change to a confirmed brief field is written back to `BRIEF.md` when it happens.

## Done

- [ ] `BRIEF.md` and `STORYBOARD.md` describe what was built.
- [ ] Everything on screen traces to `data/`.
- [ ] `lint` and `check` pass; the contact sheet was inspected.
- [ ] The owner approved the preview, then the render ran.
- [ ] The render was reviewed with `aidr-video-review`, its top five fixes applied, and it scores at least 8/10.
- [ ] The report names the MP4 path, the real duration, and anything skipped.
