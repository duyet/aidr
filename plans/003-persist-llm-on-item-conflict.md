# Plan 003: Persist LLM fields on items UPSERT conflict

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4168a5..HEAD -- apps/web/worker/workflow.ts apps/web/worker/d1-bind.ts`
> If those files drifted, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4168a5`, 2026-09-04

## Why this matters

Admin push and accepted submissions insert `status='new'` rows, then ingest
scores them. The write step is `INSERT … ON CONFLICT(id) DO UPDATE` that only
sets `published_at`, `points`, `comments`, `rank_score`, `status`. LLM columns
(`llm_*`, `category`, `tags`, `llm_tokens`, `image_url`) stay empty because
the row already exists. ALGORITHM.md steps 4–8 require those fields on
published items.

## Current state

`apps/web/worker/workflow.ts` around the items upsert (search for
`ON CONFLICT(id) DO UPDATE SET`):

```sql
INSERT INTO items (
  id, source_id, external_id, url, title, summary,
  published_at, fetched_at, points, comments,
  llm_relevance, llm_importance, llm_quality, category, tags,
  rank_score, status, llm_tokens, duplicate_of, image_url
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  published_at = excluded.published_at,
  points = excluded.points,
  comments = excluded.comments,
  rank_score = excluded.rank_score,
  status = excluded.status
```

Bind args come from `buildItemBindArgs` in `apps/web/worker/d1-bind.ts`.
Do **not** extract `db.batch` (native D1 throws `Illegal invocation` —
ALGORITHM.md). Do not wrap this write in `safeStep` if it is not already.

Pending-new pull: `workflow.ts` selects existing `status='new'` into the score
pipeline (~lines 357–394).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Tests | `export PATH="/home/box/.local/node-v22.22.1-linux-x64/bin:$PATH"` then `pnpm --filter @aidr/web test` | all pass |
| Types | `pnpm --filter @aidr/web check-types` | exit 0 |

## Scope

**In scope**
- `apps/web/worker/workflow.ts` (the ON CONFLICT SET list only, unless a small
  unit test of the SQL string is easier in an existing workflow test)
- Optional: a focused test if `worker/__tests__/` already stubs D1 prepare

**Out of scope**
- Ranking formula
- ClickHouse (removed)
- Changing `buildItemBindArgs` column order unless the SET list requires a
  matching bind (it should use `excluded.*` and keep the same INSERT)

## Git workflow

- Commit: `fix(web): persist LLM fields when ingest upserts existing items`

## Steps

### Step 1: Widen ON CONFLICT

Add to the `DO UPDATE SET` list (via `excluded.`):

- `llm_relevance`, `llm_importance`, `llm_quality`
- `category`, `tags`
- `llm_tokens`
- `image_url`
- `summary` (scored/enriched copy should win over a stub)

Do **not** overwrite `id` or `source_id`. Leave `duplicate_of` as-is unless
this same statement already writes it on insert — if the INSERT includes
`duplicate_of`, set `duplicate_of = excluded.duplicate_of` too.

**Verify**: `rg -n "ON CONFLICT\\(id\\)" apps/web/worker/workflow.ts` shows the
widened SET. `rg "llm_importance = excluded.llm_importance" apps/web/worker/workflow.ts`
matches.

### Step 2: Regression test if cheap

If `apps/web/worker/__tests__/` has no workflow write test, skip rather than
spinning a 200-line mock. Prefer asserting the SQL string if the prepare SQL
is built in a helper you can export. Do not invent a full WorkflowEntrypoint
harness.

**Verify**: existing test suite still passes.

## Test plan

- Ideal: seed an `items` row `status='new'`, run the bind/upsert, assert
  `llm_importance` and `tags` are non-empty. Only if a D1 stub pattern exists
  nearby (`d1-bind.test.ts`).
- Otherwise: code review of the SET list vs INSERT columns.

## Done criteria

- [ ] Conflict UPDATE writes LLM/taxonomy/image columns
- [ ] `pnpm --filter @aidr/web test` passes
- [ ] `plans/README.md` updated

## STOP conditions

- The upsert SQL has been split or moved since `b4168a5`.
- Fix appears to need changing `d1-bind.ts` bind order — STOP and report
  rather than reshuffling binds blindly.

## Maintenance notes

- `reprocessToday` / admin push should benefit automatically.
- Reviewers: confirm merged losers still set `status='merged'` elsewhere and
  this UPDATE cannot un-merge them (status is already in the SET list from
  `effective` merge plan).
