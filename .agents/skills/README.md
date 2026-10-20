# Repo skills

Each folder here is one skill with a `SKILL.md`. `.claude/skills`, `.cursor/skills`, and `.devin/skills` are symlinks to this directory, so every agent harness reads the same set. Open a skill's `SKILL.md` for its trigger and steps.

## Verify and operate

| Skill | Use it to |
|---|---|
| `aidr-validate` | Pick the proof level for a change (code checks, deploy check, live smoke, pipeline health) before you say "done". |
| `verify-aidr` | Drive and check the live site, the extension package, and analytics. Entry: `bin/verify-aidr doctor`, then `drive <feature>`. |
| `aidr-ops` | Validate and sync secrets and Worker config, and deploy. Run it before `pnpm sync-env` or any deploy. |
| `bugsink-triage` | Triage new production errors from Bugsink and file or fix them. |

## Release and announce

| Skill | Use it to |
|---|---|
| `aidr-release` | Ship a release end to end. |
| `aidr-release-notes` | Publish a page at `/release/vX.Y.Z`. |
| `changelog` | Add a reader-facing entry to the `/release` pages after a user-visible change. |
| `aidr-cws-release` | Release the extension and resubmit it to the Chrome Web Store. |
| `aidr-facebook-post` | Post an announcement to the AI;DR Facebook Page. |
| `aidr-facebook-token` | Mint a Facebook Page token into `.env.local`. |
| `aidr-youtube-upload` | Upload a finished video to YouTube. |

## Content

| Skill | Use it to |
|---|---|
| `aidr-vi-translation` | Translate news into Vietnamese, or change the EN to VI prompt, glossary, and draft gate. |
| `aidr-daily-news` | Make the daily brief video (16:9 and 9:16). |
| `aidr-story-clip` | Build or run the per-story clip pipeline. |
| `aidr-video` | Make, re-cut, or translate any AI;DR video under `videos/`. |
| `aidr-video-review` | Review a rendered video before it ships. |
| `aidr-motion-designer` | Motion rules for every AI;DR video frame. |

## Video tooling (HyperFrames)

These come from the HyperFrames toolchain. Start at `hyperframes`, which routes to the rest.

`hyperframes`, `hyperframes-core`, `hyperframes-cli`, `hyperframes-animation`, `hyperframes-audio`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-registry`, `hyperframes-studio`, `media-use`, `motion-graphics`, `embedded-captions`, `faceless-explainer`, `general-video`, `music-to-video`, `pr-to-video`, `product-launch-video`, `remotion-to-hyperframes`, `slideshow`, `talking-head-recut`, `figma`.

## Add a skill

Create `<name>/SKILL.md` with `name` and `description` front matter. Write the description as the trigger, naming the situations that should load it. Add a row above in the matching table.
