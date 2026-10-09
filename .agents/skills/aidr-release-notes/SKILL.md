---
name: aidr-release-notes
description: Publish a release page at aidr.today/release/vX.Y.Z — content, highlights, changelog, screenshots and a release film uploaded to YouTube. Use after a web release-please PR merges, or when asked for "release notes", "release page", "release post", "what's new in vX", or to backfill a page for an older version.
---

# aidr-release-notes

One page per web release at `/release/vX.Y.Z`, plus the list at `/release`
(the reader changelog; `/changelog` redirects there, and the site footer
links it). Part of the `aidr-release` flow: weekly, or right after a
significant change.
Modeled on the chmonitor release posts: title, version badge and date,
lead, stats, film, highlights with screenshots, grouped changelog, compare
link, other releases.

## Where things live

| What | Path |
|---|---|
| Schema | `apps/web/src/lib/releases/types.ts` (`Release`) |
| Registry (newest first) | `apps/web/src/lib/releases/index.ts` (`RELEASES`) |
| Content, one file per version | `apps/web/src/content/releases/v<X.Y.Z>.ts` |
| Screenshots | `apps/web/public/releases/v<X.Y.Z>/*.webp` |
| Page | `apps/web/src/components/ReleaseArticle.tsx`, `routes/release.$version.tsx`, `routes/release.index.tsx` |
| Film sources | `videos/releases/v<X.Y.Z>/` (renders in `renders/` are gitignored) |
| YouTube metadata | `videos/releases/v<X.Y.Z>/youtube.md` |
| Range summary script | `pnpm --filter @aidr/web release-notes <base> <head>` |

Sitemap, llms.txt and localized routing pick up every entry in `RELEASES`
automatically. Do not add routes per version.

## Workflow

1. **Pick the range.** Releases are tagged `web-vX.Y.Z` by release-please.
   Base = previous page's `compare.head`, head = the new tag. Check the
   dates: `git log -1 --format=%ad --date=short <tag>`.
2. **Summarise.** `pnpm --filter @aidr/web release-notes <base> <head>`
   gives counts by type, contributors and every feat/fix/perf commit with
   sha and PR. In zsh wrap refs in braces when followed by `:path`
   (`"${ref}:apps/..."`). Node may need
   `PATH=~/.nvm/versions/node/v24.18.0/bin:$PATH`.
3. **Write content** in `apps/web/src/content/releases/v<X.Y.Z>.ts`
   (`export const release: Release = {...}`), then add it to the top of
   `RELEASES`.
   - `title`: what readers get, not salesy. `intro`: 2–3 sentences.
   - `stats`: 3–5 real numbers from step 2 (commits, features, fixes,
     sources added…).
   - `highlights`: 5–8 reader-visible things, bold label + 1–2 sentences,
     a screenshot and an `href` to try it.
   - `changes`: reader-relevant feat/fix/perf only. Drop CI, lint, deps,
     refactors, admin plumbing and model-chain tuning. Merge near-duplicates.
     Rewrite in plain reader language with short sha and PR.
   - Vietnamese is required for every string and never falls back to
     English. Reuse the house wording in `routes/changelog.tsx`
     ("Nhận AI;DR", "trang Dữ liệu", "Fanpage Facebook") and the
     `aidr-vi-translation` skill. Keep tech terms in English.
4. **Screenshots** from production, light theme, headless Chrome:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1440,900 --screenshot=<out>.png <url>`.
   Crop to the feature, convert to WebP (`cwebp -q 82`), keep each under
   ~150 KB, record real `width`/`height` and EN+VI `alt`/`caption`.
   Pick a `cover` (also the OG image).
5. **Film.** Follow `aidr-video` + `aidr-motion-designer` (HyperFrames),
   rendering English and Vietnamese, 16:9 and 9:16, with voice-over.
   Copy the structure of the latest `videos/releases/v*/` project: title
   card "AI;DR vX.Y.Z", 4–6 highlight scenes on real UI, closing line and
   aidr.today. 16:9, 45–75 s, 1080p. Review with `aidr-video-review` until
   it scores 8/10. Write `youtube.md` (title ≤ 100 chars, description with
   chapters + links to the release page and aidr.today, tags).
6. **Upload to YouTube** with skill `aidr-youtube-upload` (the user's
   Chrome over DevTools, channel UCGDB5uD8znydgMg2XLOj04w). Earlier notes: Create → Upload videos → pick the MP4
   from `renders/`, paste title/description/tags from `youtube.md`, "No,
   it's not made for kids", visibility **Public** (ask first if the user
   did not ask for a public upload), set the cover still as thumbnail if
   the channel allows. Copy the ids into the release file:
   `youtubeId` (English 16:9) and `youtubeIdVi` (Vietnamese 16:9). The
   film is the hero at the top of the release page. If Google asks to verify the account, stop and ask the
   user to sign in; never type passwords.
7. **Verify** `pnpm --filter @aidr/web check-types`, `test`, and
   `pnpm exec biome lint apps/web/src`. Every `src` in the content file
   must exist under `apps/web/public`.
8. **Ship.** Branch `docs/release-vX.Y.Z`, semantic commits
   (`docs(web): release notes for vX.Y.Z`), PR, merge after CI. Deploy runs
   on master push. Check `https://aidr.today/release/vX.Y.Z` and its Vietnamese
   variant (`?lang=vi`) return 200 and the film plays.

Never merge release-please PRs as part of this workflow unless the user
says so.
