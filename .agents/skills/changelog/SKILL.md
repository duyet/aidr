---
name: changelog
description: Add a reader-facing entry to aidr.today's /release pages after shipping a user-visible change. Use when finishing a feature, UI change, or fix that readers can notice — or when asked to update/backfill the changelog from commits or release notes.
---

# Changelog entries

aidr.today keeps its reader-facing changelog at `/release`: one page per version (`apps/web/src/content/releases/vX.Y.Z.ts`, `highlights` + `changes`), plus `apps/web/src/content/releases/earlier.ts` for the Chrome extension notes and anything shipped before v0.1.0. `/changelog` redirects there.

## Where

`apps/web/src/content/releases/earlier.ts` — two arrays, **newest first** (version pages live next to it):

- `WEBSITE_ENTRIES` — site/feed/pipeline changes readers can see
- `EXTENSION_ENTRIES` — Chrome extension changes

Entry shape:

```ts
{ date: "YYYY-MM", en: "...", vi: "..." }
```

`date` is the shipping month. `vi` is required — write a natural Vietnamese translation, not a literal one.

## What belongs

- New pages, features, UI changes, behavior readers notice (nav, feed, subscribe, sharing cards, performance they can feel)
- Bug fixes that were user-visible

Skip internal-only work: lint/format, CI, refactors, dependency bumps, secrets plumbing. If unsure whether a change is reader-visible, ask.

## Style

- One or two sentences, reader language — the benefit, not the mechanism
- No commit hashes, PR numbers, file names, or technical jargon (no "endpoint", "wasm", "migration")
- Match existing entries' tone: plain sentences, no headings, no emoji

## Sources for backfills

- `git log --oneline` for recent commits — translate `feat`/`fix` into reader terms
- `apps/web/CHANGELOG.md` (release-please) for grouped release notes — condense; don't copy raw

## Verify

```bash
pnpm exec biome check apps/web/src/content/releases
```

Then load `/release` on the dev server and eyeball both languages via the header language toggle.
