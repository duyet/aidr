---
name: aidr-release
description: Ship an AI;DR release end to end — weekly, or right after a significant change — release-please PRs, release notes page, release films (EN/VI, 16:9/9:16) with voice-over, YouTube uploads, Facebook post, Chrome Web Store resubmit, merge and deploy. Use when asked to "cut a release", "do the weekly release", "release vX", "ship this week's release", or on the weekly schedule.
---

# aidr-release

The one entry point for a release. Each step links to the skill that owns
it; this file says the order, the gates, and what "done" means.

## When

- **Weekly** (Monday, Asia/Ho_Chi_Minh), or
- **right away** after a significant reader-visible change (a new surface,
  a feature people will notice, a fix to something broken in public).
- Skip a week when there is nothing reader-visible since the last release.

## Gates (stop and ask the user)

- Merging release-please PRs (`chore(web): release …`,
  `chore(extension): release …`) — the owner's rule is that humans merge
  them. Ask once per release; a yes covers that release only.
- Anything that asks for a password or account verification.
- A video that does not pass `aidr-video-review` at 8/10.

## Steps

1. **Ship code.** Feature PRs merged to master with CI green. Deploy runs
   on push (`.github/workflows/deploy-web.yml`); confirm it succeeded.
2. **Cut versions.** release-please opens `chore(web): release X.Y.Z` and,
   if the extension changed, `chore(extension): release A.B.C`. Gate:
   ask, then merge. Tags: `web-vX.Y.Z`, `aidr-vA.B.C` (extension zips are
   attached to its GitHub release).
3. **Release notes page** — skill `aidr-release-notes`. Range = previous
   page's `compare.head` .. new `web-v` tag. Content file, screenshots,
   register in `RELEASES`. `/release` lists every version; `/release/vX`
   is the detail page with the film as the hero. (`/changelog` redirects
   to `/release`.)
4. **Films** — skills `aidr-video`, `aidr-motion-designer`,
   `aidr-video-review`. Project `videos/releases/vX.Y.Z/` (sources in git,
   renders gitignored). Render matrix:
   `aidr-vX.Y.Z-{en,vi}-{16x9,9x16}.mp4` with voice-over from the cast in
   `videos/brand/voices.json` (English: the English hosts alternating like a
   TV show; Vietnamese: its own hosts, same rules) and burned-in captions per language. `youtube.md` holds the metadata for
   every cut. Review to 8/10.
5. **YouTube** — skill `aidr-youtube-upload`, channel
   `UCGDB5uD8znydgMg2XLOj04w`, through the user's Chrome. Upload the four
   cuts (16:9 as videos, 9:16 as Shorts) into the "AI;DR"
   playlist with `bin/yt-upload`, one command per cut. Put the ids in the release file: `youtubeId` (EN 16:9),
   `youtubeIdVi` (VI 16:9).
6. **Extension** (only if it changed) — skill `aidr-cws-release`: package
   from the GitHub release, refresh store images
   (`pnpm --filter @aidr/extension store-assets`), listing copy, submit for
   review in the dashboard.
7. **Ship the notes.** Branch `docs/release-vX.Y.Z`, commits per step
   (`docs(web): release notes for vX.Y.Z`, `feat(videos): vX.Y.Z release
   film`), PR, CI green, merge, deploy. Check
   `https://aidr.today/release/vX.Y.Z` (+ `?lang=vi`) returns 200 and the
   film plays.
8. **Announce.** Facebook Page:
   `pnpm --filter @aidr/web fb-post-release vX.Y.Z --dry-run`, read it,
   then without `--dry-run` (uses `FACEBOOK_PAGE_ID` /
   `FACEBOOK_PAGE_ACCESS_TOKEN` from `.env.local`; token problems →
   `aidr-facebook-token`). Post only after the page is live — Facebook
   caches the link preview on first share.
9. **Report.** One message to the user: versions, page URLs, YouTube
   links, store status, Facebook post id, anything skipped and why.

## Done means

All of: master deployed, release page live in both languages with its
film, four cuts on YouTube in the playlist, Facebook post up, extension
submitted (when it changed), and the report sent.

## Delegation

Run the release from the main session as the conductor and hand the
mechanical work to cheap subagents. Name each one `<model>-<level>-<task>`
(for example `haiku-low-render-queue`, `sonnet-medium-release-copy`). Give
a cheap agent an exact command or a finished spec, the files it may touch,
and what to report back.

| Who | Does |
|-----|------|
| `haiku-low-*` | Run the render queue and report `STATUS.json`; frame contact sheets; crops and WebP screenshots; oEmbed / HTTP checks (`curl` the release page, `oembed?url=https://youtu.be/<id>` → 200, 403 = still private); `gh pr checks` polling |
| `sonnet-medium-*` | Release-notes content file and VI copy; `film.json` copy and voice lines; `youtube.md` metadata; Facebook copy; skill and doc edits; PR creation |
| main session (or opus) | Visual framing judgment on snapshots; review gates (`aidr-video-review` 8/10); anything that touches the owner's Chrome (YouTube, Facebook, Chrome Web Store); merges that need the owner's approval |

### Parallel and serial

- **Parallel:** page captures, TTS and `build.mjs` per language (en, vi) can
  run in separate subagents; so can the release-notes copy, the film copy
  and `youtube.md`.
- **Serial:** renders (one 4K render at a time on this M2, use
  `scripts/queue.sh`); uploads; anything on the owner's Chrome. One driver
  at a time, never two agents on the same Chrome.
- **Upload each cut as soon as it passes review**; don't wait for all four.
  `aidr-youtube-upload` → `bin/yt-upload` is one command per cut, so the
  uploader can run while the next cut renders.

### Voice quota

ElevenLabs is on the Starter plan. Before a build, check the quota:

```bash
curl -s https://api.elevenlabs.io/v1/user/subscription -H "xi-api-key: $ELEVENLABS_API_KEY"
```

Voice clips are cached by text, so a rebuild with unchanged lines is free;
only edited lines cost characters. Keep each language's voice script around
600 characters.
