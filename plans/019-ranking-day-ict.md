# Plan 019: Story day rank uses the Asia/Ho_Chi_Minh day

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/notify/story-ranking.ts apps/web/src/lib/day-archive.ts apps/web/worker/__tests__/story-ranking.test.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/415

## Why this matters

The homepage groups a story by its Asia/Ho_Chi_Minh day (`archiveDateOfSec` / `dayBoundsSec` in `apps/web/src/lib/day-archive.ts`). The ranking panel's "day rank" uses `dayBounds`, which buckets `published_at` by UTC midnight (`publishedAtSec / 86400`). The panel copy says day rank 1 is the arrow on the homepage. Between 17:00 and 24:00 UTC that sentence points at a different day than the arrow. The comment on `dayBounds` calls the UTC bucket "the homepage grouping". That comment is wrong.

## Current state

```ts
// apps/web/worker/notify/story-ranking.ts:83-88
/** Position within the story's UTC day (the homepage grouping), rank_score
 *  desc, ties by id so it is stable. */
export function dayBounds(publishedAtSec: number): [number, number] {
  const start = Math.floor(publishedAtSec / 86400) * 86400;
  return [start, start + 86400];
}
```

```ts
// apps/web/src/lib/day-archive.ts:50-63
/** `[start, end)` epoch seconds of the audience-zone day. */
export function dayBoundsSec(date: string): { start: number; end: number } {
  const start = Math.floor(
    Date.parse(`${date}T00:00:00${AUDIENCE_UTC_OFFSET}`) / 1000
  );
  return { start, end: start + DAY_SEC };
}

export function archiveDateOfSec(sec: number): string | null {
```

`apps/web/worker/notify/threads.ts` already imports from `../../src/lib/day-archive.js`. Matching that import is allowed. Do not reimplement the +07:00 offset in `story-ranking.ts`.

```ts
// apps/web/worker/__tests__/story-ranking.test.ts:44-46
  it("splits UTC days like the homepage grouping", () => {
    expect(dayBounds(86400 + 5)).toEqual([86400, 172800]);
  });
```

That test locks the UTC behavior. It must change. `86400 + 5` is 1970-01-02 00:00:05 UTC, which is 07:00 ICT on 1970-01-02, so the ICT day is not the UTC day that starts at 86400. Prefer a modern timestamp in the new test so the ICT offset is obvious: `Date.parse("2026-10-05T18:00:00Z") / 1000` falls on ICT calendar date `2026-10-06`, whose start is `Date.parse("2026-10-05T17:00:00Z") / 1000`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/story-ranking.test.ts src/lib/day-archive.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/notify/story-ranking.ts apps/web/worker/__tests__/story-ranking.test.ts` | exit 0 |

If `day-archive.test.ts` does not exist, drop it from the command. Do not run the full suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/notify/story-ranking.ts`
- `apps/web/worker/__tests__/story-ranking.test.ts`

**Out of scope**:
- `day-archive.ts` (call it, do not edit it), the ranking panel copy, ALGORITHM.md, homepage feed grouping.

## Git workflow

- Branch: `advisor/019-ranking-day-ict`
- Commit: `fix(web): rank a story inside its ICT day`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Delegate the window

Implement `dayBounds` as: `archiveDateOfSec(publishedAtSec)`, then `dayBoundsSec` of that date, returned as `[start, end]`. If `archiveDateOfSec` returns null, return `[0, 0]` so the SQL range matches nothing rather than a UTC guess. Update the comment to say Asia/Ho_Chi_Minh, the same day as the homepage archive.

**Verify**: `pnpm exec biome lint apps/web/worker/notify/story-ranking.ts` → exit 0

### Step 2: Replace the UTC test

Replace the test named "splits UTC days like the homepage grouping". For `Date.parse("2026-10-05T18:00:00Z") / 1000`, expect `dayBounds` to equal `[start, end]` from `dayBoundsSec("2026-10-06")` imported from `src/lib/day-archive.ts`. Also expect `start` to equal `Date.parse("2026-10-05T17:00:00Z") / 1000`.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/story-ranking.test.ts` → all pass.

## Test plan

The test must call `dayBounds` from `worker/notify/story-ranking.ts` and compare it to `dayBoundsSec` from `src/lib/day-archive.ts`. Do not recompute `publishedAtSec / 86400` in the test as the expected value.

## Done criteria

- [ ] `dayBounds` uses `archiveDateOfSec` and `dayBoundsSec`
- [ ] 2026-10-05 18:00 UTC maps to the ICT day that starts at 17:00 UTC that same calendar date
- [ ] Targeted vitest exits 0
- [ ] `day-archive.ts` is untouched

## STOP conditions

- `dayBoundsSec` or `archiveDateOfSec` does not match the excerpt. Stop.
- Importing `src/lib/day-archive.ts` from the worker pulls in a browser-only module and the test fails to load. Stop and report the import error. Do not copy the offset math into `story-ranking.ts`.
- The targeted test fails twice.

## Maintenance notes

The homepage arrow and this day rank now share one day function. A change to `AUDIENCE_UTC_OFFSET` moves both. Reviewers should confirm the SQL that uses `dayBounds` still binds `[start, end)` and not a closed end.
