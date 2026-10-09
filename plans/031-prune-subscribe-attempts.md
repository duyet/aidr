# Plan 031: Delete subscribe_attempts rows older than one day

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/workflow.ts apps/web/worker/rate-limit.ts apps/web/worker/__tests__/schedule.test.ts`
> On a mismatch with the prune call excerpt, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/427

## Why this matters

Anonymous MCP reads, subscribe attempts, and failed admin auth only insert into `subscribe_attempts`. Nothing deletes. The rate-limit window is one day (`ONE_DAY_SEC`). Rows older than that cannot affect a count and the table grows without a bound.

## Current state

```ts
// apps/web/worker/workflow.ts:169
    await pruneLlmCalls(this.env);
```

`apps/web/worker/__tests__/schedule.test.ts` asserts that line exists and that it runs after the workflow_runs upsert. Keep that order. Add the new prune after `pruneLlmCalls`, not before.

`ONE_DAY_SEC` is exported from `apps/web/worker/rate-limit.ts`. Rate-limit queries use `created_at` in milliseconds (`buildRateLimitQuery`).

The table is created in `migrations/0015_mail.sql` as `(ip_hash, created_at)`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/rate-limit.test.ts worker/__tests__/schedule.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/rate-limit.ts apps/web/worker/workflow.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/rate-limit.ts`
- `apps/web/worker/workflow.ts` (one call after `pruneLlmCalls`)
- `apps/web/worker/__tests__/rate-limit.test.ts`
- `apps/web/worker/__tests__/schedule.test.ts` only if the source assertion must mention the new call

**Out of scope**:
- the insert sites, migrations, MCP limit numbers.

## Git workflow

- Branch: `advisor/031-prune-subscribe-attempts`
- Commit: `perf(web): prune subscribe attempts older than a day`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Delete old rows

Export `pruneSubscribeAttempts(db, nowMs = Date.now())` from `rate-limit.ts`. It runs `DELETE FROM subscribe_attempts WHERE created_at < ?` bound to `nowMs - ONE_DAY_SEC * 1000`. Swallow a missing-table error the way `checkAdminAuthRateLimit` does, and log nothing else. Call it from `workflow.ts` immediately after `await pruneLlmCalls(this.env)`.

**Verify**: `pnpm exec biome lint apps/web/worker/rate-limit.ts apps/web/worker/workflow.ts` → exit 0

### Step 2: Test the cutoff

In `rate-limit.test.ts`, a fake DB records the bound. `pruneSubscribeAttempts(db, 1_000_000_000_000)` binds `1_000_000_000_000 - 86_400_000`. Assert that number. In `schedule.test.ts`, assert the workflow source still contains `await pruneLlmCalls(this.env)` before the new call.

**Verify**: the targeted vitest command exits 0.

## Test plan

Call `pruneSubscribeAttempts`. The expected bound is `nowMs - ONE_DAY_SEC * 1000` computed in the test from the exported `ONE_DAY_SEC`, not a pasted magic number alone. You may also assert the literal `86400000` if you show it equals `ONE_DAY_SEC * 1000`.

## Done criteria

- [ ] The workflow calls `pruneSubscribeAttempts` after `pruneLlmCalls`
- [ ] The delete cutoff is one day behind `nowMs`
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the touched files exits 0

## STOP conditions

- `created_at` for `subscribe_attempts` is stored in seconds, not milliseconds. Read an insert (`Date.now()` in `subscribe/handlers.ts` and `admin/auth.ts`). If those bind seconds, STOP and match them.
- The schedule test requires `pruneLlmCalls` to be the last statement in `run()`. Stop and report.
- The targeted test fails twice.

## Maintenance notes

Do not delete rows inside the rate-limit window. A longer window added later must raise this cutoff in the same change.
