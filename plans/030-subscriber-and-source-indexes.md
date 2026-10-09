# Plan 030: Index unsubscribe tokens and items by source

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/migrations apps/web/worker/subscribe/handlers.ts apps/web/src/lib/system-queries.ts`
> If a migration numbered `0050` or higher already exists, STOP and pick the next free number. Do not renumber shipped files.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/426

## Why this matters

Confirm, unsubscribe, and preference updates filter `subscribers.unsubscribe_token` with no index. The primary key is `email` (`migrations/0004_subscribers.sql`). The public sources rollup joins `items.source_id` and takes `MAX(published_at)`. Indexes on `items` are `published_at`, `(category, published_at)`, `status`, and a partial `source_id` index only `WHERE status = 'merged'` (`migrations/0048_items_read_indexes.sql`). That partial index does not serve the sources join. Both reads scan as the tables grow.

## Current state

Token lookups in `apps/web/worker/subscribe/handlers.ts` use `WHERE unsubscribe_token = ?` (confirm, unsubscribe, prefs). Do not change those queries.

```sql
-- apps/web/migrations/0004_subscribers.sql
-- email is the primary key. No unsubscribe_token index.
```

```ts
// apps/web/src/lib/system-queries.ts:482-488
-- LEFT JOIN items i ON i.source_id = s.id with COUNT and MAX(published_at)
```

The next migration number is `0050`. Match the header style of `0048_items_read_indexes.sql`. `apps/web/worker/__tests__/migration-0048.test.ts` shows how a test reads a migration file and asserts index names. Copy that shape. Do not apply the migration to production. Do not run `d1:migrate`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Order check | `pnpm --filter @aidr/web run check:migration-order` | exit 0 |
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/migration-0050.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/__tests__/migration-0050.test.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/migrations/0050_subscriber_token_and_source_indexes.sql` (create)
- `apps/web/worker/__tests__/migration-0050.test.ts` (create)

**Out of scope**:
- handler SQL, `system-queries.ts`, production D1, earlier migration files.

## Git workflow

- Branch: `advisor/030-read-indexes`
- Commit: `perf(web): index unsubscribe tokens and items by source`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Add the migration

One file, two statements:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token
  ON subscribers (unsubscribe_token);

CREATE INDEX IF NOT EXISTS idx_items_source_published
  ON items (source_id, published_at);
```

`IF NOT EXISTS` matches the other migrations. Unique is correct because each row has its own token. Do not add a query.

**Verify**: `pnpm --filter @aidr/web run check:migration-order` → exit 0

### Step 2: Assert the file

A test reads the migration file as text and expects both index names. Follow `migration-0048.test.ts`. Do not open a database.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/migration-0050.test.ts` → all pass.

## Test plan

The test reads the shipped SQL file. It does not recreate the indexes in a string inside the test and compare that string to itself.

## Done criteria

- [ ] `0050_subscriber_token_and_source_indexes.sql` exists with both indexes
- [ ] `check:migration-order` exits 0
- [ ] The new vitest exits 0
- [ ] No handler or query file is modified

## STOP conditions

- `0050` is taken. Stop and use the next number. Say which.
- A subscriber migration already indexes `unsubscribe_token`. Stop.
- `check:migration-order` fails twice.

## Maintenance notes

A duplicate `unsubscribe_token` already in D1 will fail this unique index at apply time. This plan does not apply it. If you discover the schema allows duplicates by design, STOP and use a non-unique index instead.
