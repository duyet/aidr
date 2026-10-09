# Plan 025: Channel copy follows source_lang, not diacritics

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/notify/index.ts apps/web/src/lib/day-card-pick.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/421

## Why this matters

`channelCopy` says a channel uses its own translation, or the source text only when the source is already that language. The source language is then `looksVietnamese(source_title)`. A Vietnamese headline with no diacritic is treated as English and can be posted on the English trending channel. An English headline that contains a Vietnamese name is treated as Vietnamese and skipped on English. Language columns do not fall back to each other. `source_lang` is the explicit column the pipeline already stores. The English day card uses the same diacritic test.

## Current state

```ts
// apps/web/worker/notify/index.ts:280-292
  const { source_title, source_summary, tr_title, tr_summary, ...rest } = row;
  const translated = tr_title?.trim();
  if (translated) {
    return {
      ...rest,
      title: translated,
      summary: tr_summary?.trim() || null,
      lang,
    };
  }
  const sourceLang: Lang = looksVietnamese(source_title) ? "vi" : "en";
  if (sourceLang !== lang) return null;
  return { ...rest, title: source_title, summary: source_summary, lang };
```

`buildTrendingQuery` selects `i.title AS source_title` and does not select `i.source_lang`.

Most English rows leave `source_lang` null. Only an explicit `vi` (VnExpress and other rows that set it) is Vietnamese. Null and `en` are English. Do not call `looksVietnamese` from `channelCopy`.

`apps/web/src/lib/day-card-pick.ts` around the English tile uses the diacritic test and then prints `item.title`. Gate that the same way: explicit `source_lang === "vi"` is Vietnamese. Read the function before editing. The `FeedItem` type must already carry `source_lang`, or the day-card query must select it. If `FeedItem` has no `source_lang`, STOP and report rather than adding a column to every feed query.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/notify.test.ts src/lib/day-card-pick.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/notify/index.ts apps/web/src/lib/day-card-pick.ts` | exit 0 |

Drop `day-card-pick.test.ts` from the command if it does not exist and you did not create one. Do not run the full suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/notify/index.ts`
- `apps/web/src/lib/day-card-pick.ts` only if `source_lang` is already on the item type it receives
- the notify test, and a day-card test only if you change that file

**Out of scope**:
- translation prompts, `looksVietnamese` itself (leave the function), `tldr-lang.ts`.

## Git workflow

- Branch: `advisor/025-channel-copy-source-lang`
- Commit: `fix(web): choose channel copy from source_lang`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Select and use source_lang

Add `source_lang` to `ChannelCopyRow` as `string | null`. Select `i.source_lang` in `buildTrendingQuery`. In `channelCopy`, after the translation branch, set `sourceLang` to `"vi"` only when `source_lang === "vi"`. Otherwise it is `"en"`. Keep the `sourceLang !== lang` skip.

**Verify**: `pnpm exec biome lint apps/web/worker/notify/index.ts` → exit 0

### Step 2: Test both mistakes the diacritic check makes

Call `channelCopy`. A row with `source_lang: "vi"`, an ASCII title, and no translation returns null for `en` and the source title for `vi`. A row with `source_lang: null` or `"en"` and a title containing `Nguyễn` returns the source title for `en` and null for `vi`, when there is no translation. A row with `tr_title` set still returns the translation for that channel even when `source_lang` differs.

If you change the day card, one test: an English card does not pick a `source_lang: "vi"` title that has no diacritics.

**Verify**: the targeted vitest command exits 0.

## Test plan

Call the exported `channelCopy`. Do not reimplement the vi check in the test.

## Done criteria

- [ ] `channelCopy` does not call `looksVietnamese`
- [ ] Explicit `source_lang === "vi"` is the only Vietnamese source
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the touched files exits 0

## STOP conditions

- The excerpt does not match.
- The day-card item type has no `source_lang` and adding it means editing the feed SELECT. Stop on the day card and finish the notify change only.
- The targeted test fails twice.

## Maintenance notes

`looksVietnamese` remains for TL;DR quality checks. Do not use it to decide which channel may post a story.
