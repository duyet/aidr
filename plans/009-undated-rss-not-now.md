# Plan 009: An RSS item with no date is not treated as published now

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/sources/rss.ts apps/web/worker/__tests__/rss.test.ts`
> On a mismatch with the excerpts, STOP.
>
> This plan touches the same files as plan 008. If 008 has not merged, STOP and report the overlap. Do not combine the two fixes in one branch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/008-rss-numeric-entities.md (same files; land 008 first)
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/405

## Why this matters

`parseRssItems` stamps `Date.now()` when `pubDate` / `published` / `updated` is missing or not a date. `rssAdapter.fetchItems` then keeps every item with `publishedAt >= sinceMs`. An undated item always looks like it was published this hour, so the first time that URL is seen it enters the 26-hour window and can be scored and published as fresh news. `apps/web/scripts/verify-source-feeds.ts` already treats a usable item as one with `Number.isFinite(item.publishedAt)` and says a valid feed needs a parseable date. `Date.now()` makes a missing date look parseable.

## Current state

```ts
// apps/web/worker/sources/rss.ts:291-297
    const pub =
      tagText(chunk, "pubDate") ??
      tagText(chunk, "published") ??
      tagText(chunk, "updated");
    const publishedMs = pub ? Date.parse(pub) : Number.NaN;
    const publishedAt = Number.isFinite(publishedMs) ? publishedMs : Date.now();
```

```ts
// apps/web/worker/sources/rss.ts:380-383
    const sinceMs = sinceEpochSec * 1000;
    const inWindow = parseRssItems(xml).filter(
      (item) => item.publishedAt >= sinceMs
    );
```

`apps/web/scripts/verify-source-feeds.ts` lines 270–275 count an item as usable only when `Number.isFinite(item.publishedAt)`. Do not edit that script. `NaN` is not finite, so an undated item stops counting as usable there, which matches its comment.

Existing tests in `rss.test.ts` build `<item>` blocks with no `pubDate` and assert on `summary` only. They must keep returning the item from `parseRssItems`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/rss.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/sources/rss.ts apps/web/worker/__tests__/rss.test.ts` | exit 0 |

Do not run the full web test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/sources/rss.ts`
- `apps/web/worker/__tests__/rss.test.ts`

**Out of scope**:
- `verify-source-feeds.ts`, `mail/content.ts`, the flood gate, dedupe.

## Git workflow

- Branch: `advisor/009-undated-rss`
- Commit: `fix(web): drop undated RSS items from the fetch window`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Stop substituting now

When `publishedMs` is not finite, set `publishedAt` to `Number.NaN` instead of `Date.now()`. In `fetchItems`, keep an item only when `Number.isFinite(item.publishedAt)` and `item.publishedAt >= sinceMs`. Still return undated items from `parseRssItems` so summary clipping tests keep a row. `sources[0].postedAt` for an undated item may be `NaN`; that object is not written because `fetchItems` filters it out. Do not coerce `NaN` back to `Date.now()` anywhere in this file.

**Verify**: `pnpm exec biome lint apps/web/worker/sources/rss.ts` → exit 0

### Step 2: Test the window

Add a `rssAdapter.fetchItems` test. Stub `fetch` with one item that has a `pubDate` inside the window and one item with no date and a different `https://` link. The since-epoch must be in the past relative to the dated item. Expect only the dated URL in the result. Add a `parseRssItems` assertion that the undated item is still returned and `Number.isFinite(item.publishedAt)` is false.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/rss.test.ts` → all pass.

## Test plan

Use the existing `vi.stubGlobal("fetch", ...)` pattern in `describe("rssAdapter")`. The new test must call `rssAdapter.fetchItems`, not a reimplementation of the filter.

## Done criteria

- [ ] No `Date.now()` fallback remains in `parseRssItems`
- [ ] `fetchItems` omits an undated item and keeps a dated in-window item
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0
- [ ] `verify-source-feeds.ts` is untouched

## STOP conditions

- The `publishedAt` excerpt does not match (plan 008 may have edited nearby lines; that is fine if these two excerpts still match).
- Plan 008's branch is unmerged and you are about to edit the same lines for entities. Stop.
- A catalog comment or test says a specific source is ingested only because its items have no date. Stop and report that source id.

## Maintenance notes

A feed that publishes items with no date will show zero new items until the publisher adds dates. That is the point of the change. Reviewers should confirm dated items with a timezone offset still pass, especially the VnExpress `+0700` test already in `rss.test.ts`.
