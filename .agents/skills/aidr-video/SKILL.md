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
- **Script, voice, picture and sound follow "Script and voice" below.**
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

## Script and voice

Every AI;DR video is cut like a TV commercial, not a product tour. These rules are the single source; other video skills point here.

**Script**

- Hook in the first 2 s: the strongest picture and the first spoken line land together. No logo intro, no title card first.
- 2 to 5 voice lines in the whole cut, each one short sentence of 8 words or fewer.
- Sell the benefit or the feeling, never the feature. "Your morning, already read." beats "It has a summary panel."
- No feature lists and no feature tours. One idea per cut.
- No UI callouts: no button highlights, no arrows, no cursor tours, no "click here".
- The last line is the call to action with the short link or `aidr.today`.
- Run the `aidr-unslop` pass on every line before review.

**Pace and voice**

- Target 2.8 to 3.3 words per second in English and 3.4 to 4.0 in Vietnamese, faster than conversational read. `voiceProblems` in `aidr-video-review/scripts/rubric.mjs` still fails a line above 1.35x the reading rate (EN 3.5, VI 4.3).
- Cut every 1 to 2 s. No shot holds longer than its line.
- Cast for TVC energy: a confident, warm, upbeat host from `videos/brand/voices.json`. Raise `style` and drop `stability` per project (about `style` 0.35, `stability` 0.35) rather than editing the shared settings. Re-voice any line that reads flat.

**Picture**

- Art-led: real screenshots of the product are the hero, full-bleed or on a tilted card, never a shrunken window with labels.
- Kinetic type carries the voice line's key word; brand color fields from `videos/brand/brand.md` fill the frame between screenshots.
- No stock icons, no bullet slides.

**Sound**

- Fresh effects per project, picked for the cut: a hit or riser on each beat cut, a soft tick per typed character, one end sting on the logo.
- Do not reuse the stock whoosh set from earlier projects. Effects sync to their visual hit per `aidr-motion-designer`.
- The music bed ducks under the voice and carries the cuts on the beat.

## Voices

The voice cast lives in `videos/brand/voices.json` (ElevenLabs): five
English hosts and four Vietnamese hosts, the owner's picks. Every voiced
AI;DR video — release films, the daily brief, changelog/feature clips —
uses it the same way: hosts alternate per scene or story like a TV show or
podcast, never the same voice twice in a row, opener and closer differ,
order from a seeded shuffle (seed = edition date or release version) so
re-renders match. Short natural hand-offs between hosts are fine. Add a
voice to the account from the shared library when it is missing
(`POST /v1/voices/add/{public_owner_id}/{voice_id}`).
