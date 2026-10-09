# Plan 006: A failed item_votes probe must not disable votes for the isolate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`; the dispatcher
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/votes.ts apps/web/worker/__tests__/votes.test.ts`
> If either file changed, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/402

## Why this matters

`itemVotesTableReady` remembers the first probe of `item_votes` for the life of the Worker isolate. A successful probe stays true, which is what the comment says. A thrown probe is also stored as `false`. One transient D1 error on the first feed or story read after a cold start then skips the vote join until that isolate dies, so signed-in votes disappear from the homepage and the story dialog even though migration 0049 is applied.

## Current state

- `apps/web/worker/votes.ts` — vote read/write helpers. The probe is module state.
- `apps/web/src/lib/feed-queries.ts` and `apps/web/src/lib/story-queries.ts` call `itemVotesTableReady` before joining `item_votes`. Do not edit those files.
- `apps/web/worker/__tests__/votes.test.ts` — existing vote tests. Match its `describe` / `it` style.

```ts
// apps/web/worker/votes.ts:170-185
let votesTableReady: boolean | null = null;

/** Feed and story reads skip the join until the migration is applied.
 * A successful probe stays true for the life of the isolate. */
export async function itemVotesTableReady(db: {
  prepare(sql: string): { all(): Promise<unknown> };
}): Promise<boolean> {
  if (votesTableReady !== null) return votesTableReady;
  try {
    await db.prepare("SELECT item_id FROM item_votes LIMIT 1").all();
    votesTableReady = true;
  } catch {
    votesTableReady = false;
  }
  return votesTableReady;
}
```

Conventions: Vitest, no new dependencies. A comment may state a constraint the code does not make obvious. Do not add a compatibility shim that keeps caching `false`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/votes.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/votes.ts apps/web/worker/__tests__/votes.test.ts` | exit 0 |

Run both from the repo root. Do not run `pnpm --filter @aidr/web test` (the full suite) or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/votes.ts`
- `apps/web/worker/__tests__/votes.test.ts`

**Out of scope**:
- `feed-queries.ts`, `story-queries.ts`, migrations, ranking.

## Git workflow

- Branch: `advisor/006-vote-table-probe`
- One commit: `fix(web): retry the item_votes probe after a miss`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- The dispatcher tells you to push and open one PR to `master`. Do that. Do not merge.

## Steps

### Step 1: Cache only a successful probe

In `itemVotesTableReady`, store `true` after the SELECT succeeds. On throw, return `false` and leave `votesTableReady` null so the next call tries again. Export `resetItemVotesTableProbe()` that sets the module flag back to null. Tests need it; production callers do not.

**Verify**: `pnpm exec biome lint apps/web/worker/votes.ts` → exit 0

### Step 2: Prove a failed probe does not stick

In `votes.test.ts`, add a test that:

1. Calls `resetItemVotesTableProbe()`.
2. A db whose `prepare().all()` throws on the first call and resolves on the second.
3. Expects the first `itemVotesTableReady` result to be `false` and the second to be `true`.

Add a second test: after a successful probe, a later throwing db still returns `true` without calling `all` again (the success cache stays).

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/votes.test.ts` → all pass, including the two new tests.

## Test plan

Pattern: `apps/web/worker/__tests__/votes.test.ts`. The new tests must call the exported `itemVotesTableReady`, not a copy of the probe.

## Done criteria

- [ ] A thrown probe returns false and the next successful probe returns true
- [ ] A successful probe is not repeated
- [ ] `pnpm --filter @aidr/web exec vitest run worker/__tests__/votes.test.ts` exits 0
- [ ] `pnpm exec biome lint` on the two in-scope files exits 0
- [ ] `git status` shows only the two in-scope files

## STOP conditions

- The excerpt in Current state does not match `votes.ts`.
- The fix seems to require editing `feed-queries.ts` or `story-queries.ts`.
- The targeted test fails twice after a real fix attempt.

## Maintenance notes

A later migration that drops `item_votes` will stay "not ready" on every request instead of latching off. That is the intended cost. Reviewers should check the success path still caches.
