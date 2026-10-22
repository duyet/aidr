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

## Review output

Each review skill scores one kind of output out of 10 on a rubric. A script decides the automatic rows from stored data, read-only, and the reviewer judges the rest. Nothing ships below 8. The scripts live in `apps/web/scripts/review/` and share `rubric.ts`.

| Skill | Use it to |
|---|---|
| `aidr-digest-review` | Score the TL;DR snapshot and digest bullets, EN and VI. |
| `aidr-post-review` | Score the Telegram and Facebook posts. |
| `aidr-email-review` | Score the digest email. |
| `aidr-vi-translation` | Score stored Vietnamese translations ("Score a translation" section). |
| `aidr-card-review` | Score the day card and the OG images. |
| `aidr-copy-review` | Score marketing copy against `docs/marketing/positioning.md`. |
| `aidr-video-review` | Score a rendered video. |

## Video tooling (HyperFrames)

These come from the HyperFrames toolchain. Start at `hyperframes`, which routes to the rest.

`hyperframes`, `hyperframes-core`, `hyperframes-cli`, `hyperframes-animation`, `hyperframes-audio`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-registry`, `hyperframes-studio`, `media-use`, `motion-graphics`, `embedded-captions`, `faceless-explainer`, `general-video`, `music-to-video`, `pr-to-video`, `product-launch-video`, `remotion-to-hyperframes`, `slideshow`, `talking-head-recut`, `figma`.

## Vendored skill tests

The HyperFrames skills ship their own `*.test.mjs` files. `hyperframes skills install` overwrites them, so do not edit them here. CI does not run them: `pnpm test` is `pnpm -r test`, and `.agents/skills` is not a workspace package.

To run them by hand, from the repo root:

```bash
node --test ".agents/skills/**/*.test.mjs"
```

Some need `ffmpeg` on `PATH`. Three files fail in this repo, because they assume the layout of the upstream HyperFrames checkout:

| Test | Why it fails here |
|---|---|
| `embedded-captions/scripts/make-theme.test.mjs` | Reads `scripts/fixtures/heroless/transcript.json`, which the skill's own ignore file excludes, so a clone never has it. |
| `hyperframes-creative/scripts/package-loader.test.mjs` | Expects a `package.json` named `hyperframes` or `@hyperframes/cli` in an ancestor directory to pin a version. There is none in this repo, so the spec falls back to `@latest`. |
| `hyperframes-animation/scripts/package-loader.test.mjs` | Same as above. |

Treat those failures as expected. Any other failure in this directory is real.

## Add a skill

Create `<name>/SKILL.md` with `name` and `description` front matter. Write the description as the trigger, naming the situations that should load it. Add a row above in the matching table.
