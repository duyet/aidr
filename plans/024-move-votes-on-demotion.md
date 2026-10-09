# Plan 024: Reader votes move when an official post takes the canonical

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/ingest/write.ts apps/web/worker/__tests__/write-merge-rank.test.ts`
> On a mismatch with the excerpt, STOP.
>
> Plan 006 also edits vote code, but only `worker/votes.ts`. This plan must not edit that file.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/420

## Why this matters

When an official post replaces an aggregator canonical, `demotedCanonicalStatements` repoints `duplicate_of` and moves `notifications`. It does not move `item_votes`. Rank reads `item_votes` for `items.id` only, and this run's re-rank skips the new id because it is in `writtenIds`. Votes stay on the demoted row. The story page follows `duplicate_of` to the new id and shows a net of 0.

## Current state

```ts
// apps/web/worker/ingest/write.ts:210-231
export function demotedCanonicalStatements(
  db: D1Database,
  demotedId: string,
  canonicalId: string
): D1PreparedStatement[] {
  return [
    db.prepare(
      "UPDATE items SET duplicate_of = ? WHERE status = 'merged' AND duplicate_of = ?"
    ).bind(nn(canonicalId), nn(demotedId)),
    db.prepare(
      "UPDATE items SET status = 'merged', duplicate_of = ? WHERE id = ? AND status = 'published'"
    ).bind(nn(canonicalId), nn(demotedId)),
    db.prepare(
      "UPDATE OR IGNORE notifications SET item_id = ? WHERE item_id = ?"
    ).bind(nn(canonicalId), nn(demotedId)),
  ];
}
```

`item_votes` primary key is `(item_id, user_id)` (`migrations/0049_item_votes.sql`). A reader who voted on both ids cannot be moved with a plain `UPDATE` of `item_id`.

The new canonical's rank is computed in `planNewItemWrite` (`write-plan.ts`). Do not change that file unless the demotion statements alone cannot affect `rank_score`. The hourly re-rank skips `writtenIds`. So after the vote rows move, this run still keeps the rank computed without those votes until the next run. Include the moved net in the new row: read how `planNewItemWrite` sets `rank_score`. If it has no vote input, add an optional `voteNet` argument defaulting to 0, and pass the sum of the demoted row's votes from the caller in `write.ts`. That caller already has the demotion list. If getting the sum requires a SELECT that the batch cannot see yet, compute it before the batch from the demoted ids and pass it in. Do not leave the new rank at the no-vote value when votes moved.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/write-merge-rank.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/ingest/write.ts apps/web/worker/ingest/write-plan.ts apps/web/worker/__tests__/write-merge-rank.test.ts` | exit 0 |

Do not run the full web suite or `check-types`. Do not edit `worker/votes.ts`.

## Scope

**In scope**:
- `apps/web/worker/ingest/write.ts`
- `apps/web/worker/ingest/write-plan.ts` only if the new rank must take `voteNet`
- `apps/web/worker/__tests__/write-merge-rank.test.ts`

**Out of scope**:
- `worker/votes.ts`, `ranking.ts` join shape, migrations.

## Git workflow

- Branch: `advisor/024-move-votes-on-demotion`
- Commit: `fix(web): keep reader votes when an official post takes over`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Move votes without colliding

Add statements to `demotedCanonicalStatements`:

1. Delete demoted votes whose `(canonicalId, user_id)` already exists, after adding the demoted value into the surviving row when the signs differ. Simplest correct rule: if both rows exist, keep the canonical row's value and delete the demoted duplicate. If only the demoted row exists, `UPDATE item_votes SET item_id = ? WHERE item_id = ?`.
2. Order them so the delete of conflicts runs before the update. SQLite allows `UPDATE OR IGNORE` when the unique key would collide; that keeps the destination row and skips the move. Prefer an explicit delete of conflicting demoted rows, then `UPDATE` the rest, so a vote that exists only on the demoted id is not ignored.

The new canonical's `rank_score` for this write must include `voteNet` equal to the sum of `value` on the demoted id (the rows you are about to move). Thread that sum into the existing rank call. Do not default it to 0 when the demoted row has votes.

**Verify**: `pnpm exec biome lint apps/web/worker/ingest/write.ts` → exit 0

### Step 2: Test the statements

Extend `write-merge-rank.test.ts`. Assert the demotion SQL mentions `item_votes` and that a helper you export for the conflict delete runs before the update. If the test uses a fake D1, run the statements against it: one user voted only on the demoted id, one user voted on both. After the statements, both users have a row on the canonical id, the demoted id has none, and the user who voted on both still has one row.

**Verify**: the targeted vitest command exits 0.

## Test plan

Drive `demotedCanonicalStatements` or the batch `write.ts` already builds in the existing test. Do not update `item_votes` inside the test and call that the fix.

## Done criteria

- [ ] Demotion moves `item_votes` onto the new canonical
- [ ] A user who voted on both ids still has one row
- [ ] The new row's rank input includes that net
- [ ] Targeted vitest exits 0
- [ ] `worker/votes.ts` is untouched

## STOP conditions

- The demotion excerpt does not match.
- `item_votes` has no `(item_id, user_id)` primary key. Stop.
- The targeted test fails twice.

## Maintenance notes

Notifications already move with `UPDATE OR IGNORE`. Votes need the conflict delete because a skipped update would drop the only copy of a vote. Reviewers should check the delete runs first.
