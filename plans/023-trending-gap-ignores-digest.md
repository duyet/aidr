# Plan 023: The trending gap ignores digest rows

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/notify/index.ts apps/web/worker/notify/story-ranking.ts apps/web/worker/__tests__/notify.test.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/419

## Why this matters

`sent_today` already ignores `digest:%` rows. `MAX(posted_at)` does not. The 08:00 digest and the 09:00 trending window are different runs, so the same-run bypass (`sent[notifier.id] > 0 ? null`) never clears that morning digest. Importance-7 stories then wait until the gap after the digest expires. They need the burst floor instead of the normal floor. The story ranking query uses the same `MAX(posted_at)`.

## Current state

```ts
// apps/web/worker/notify/index.ts:649-664
    const stats = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN item_id NOT LIKE 'digest:%' AND posted_at >= ? THEN 1 ELSE 0 END) AS sent_today,
         MAX(posted_at) AS last_posted_at
       FROM notifications WHERE channel = ? AND status = 'sent'`
    )
      .bind(dayStartMs, notifier.id)
      .first<{ sent_today: number | null; last_posted_at: number | null }>();

    const importanceFloor = trendingImportanceFloor(
      stats?.sent_today ?? 0,
      sent[notifier.id] > 0 ? null : (stats?.last_posted_at ?? null),
      now
    );
```

Digest item ids are `digest:` plus the date. Trending rows use the story id.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/notify.test.ts worker/__tests__/story-ranking.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/notify/index.ts apps/web/worker/notify/story-ranking.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/notify/index.ts`
- `apps/web/worker/notify/story-ranking.ts` (only the last-posted query, if it also takes `MAX(posted_at)` without the digest filter)
- `apps/web/worker/__tests__/notify.test.ts`
- `apps/web/worker/__tests__/story-ranking.test.ts` only if that query is built by an exported function there

**Out of scope**:
- Telegram send, Facebook, the importance numbers themselves.

## Git workflow

- Branch: `advisor/023-trending-gap-digest`
- Commit: `fix(web): keep the digest out of the trending gap`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Filter the max

Change `last_posted_at` to `MAX(CASE WHEN item_id NOT LIKE 'digest:%' THEN posted_at END)`. Remove the `sent[notifier.id] > 0 ? null` branch so a digest sent earlier in this same run is not a special case and a trending post earlier today is not forgotten. Pass `stats?.last_posted_at ?? null` straight through.

If `loadStoryRanking` selects `MAX(posted_at)` the same way, add the same `digest:%` exclusion there.

**Verify**: `pnpm exec biome lint apps/web/worker/notify/index.ts apps/web/worker/notify/story-ranking.ts` → exit 0

### Step 2: Test the floor

Add a test that builds the stats the way the SQL now does, or that calls `trendingImportanceFloor` with a `lastPostedAtMs` taken only from a story row. The case that matters: `sent_today` is 0 and `lastPostedAtMs` is null when the only `sent` row would have been a digest. Expect the floor to be the base floor (7, unless the constant in `notify/index.ts` says otherwise — read `TRENDING_MIN_IMPORTANCE` / `trendingImportanceFloor` and assert that function's return, do not invent 7 if the code says something else).

A second case: `lastPostedAtMs` one hour ago from a trending row still raises the floor. Use the existing `trendingImportanceFloor` tests if they exist; extend them.

**Verify**: the targeted vitest command exits 0.

## Test plan

Call `trendingImportanceFloor` or the exported query builder. Do not copy the CASE expression into the test as the thing under test if an exported function builds the SQL. If the SQL is inline, extract `trendingGapSql` or assert the SQL string from a new exported constant next to the query.

## Done criteria

- [ ] `last_posted_at` ignores `digest:%` rows
- [ ] The same-run `null` override is gone
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the touched files exits 0

## STOP conditions

- The stats excerpt does not match.
- `trendingImportanceFloor` treats `null` as "gap already elapsed" and a test shows the base floor would drop below the documented minimum. Stop and report.
- The targeted test fails twice.

## Maintenance notes

The 3-hour gap is between trending posts only. The 08:00 digest is not a trending post.
