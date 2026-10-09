# Plan 028: deleteSource reports a missing id

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/admin/handlers.ts apps/web/worker/__tests__/admin.test.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/424

## Why this matters

`deleteSource` deletes by id and returns `{ ok: true }` without checking that a row changed. A typo looks like a deleted source to the admin API and the MCP tool.

## Current state

```ts
// apps/web/worker/admin/handlers.ts:317-326
export async function deleteSource(
  env: Env,
  id: string
): Promise<{ ok: true; id: string } | HandlerError> {
  if (!id) {
    return { error: "id is required", status: 400 };
  }
  await env.DB.prepare("DELETE FROM sources WHERE id = ?").bind(id).run();
  return { ok: true, id };
}
```

D1's `run()` result has `meta.changes`. `rejectSubmissionById` in `apps/web/worker/submissions.ts` is the pattern for "no row" if it already checks a changed count. Read it and match its error shape (`HandlerError`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/admin.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/admin/handlers.ts apps/web/worker/__tests__/admin.test.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/admin/handlers.ts` (`deleteSource` only)
- `apps/web/worker/__tests__/admin.test.ts`

**Out of scope**:
- `upsertSource`, submissions, MCP tool list.

## Git workflow

- Branch: `advisor/028-delete-source-missing`
- Commit: `fix(web): report a missing source on delete`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Read changes

After `run()`, if `meta.changes` is 0, return `{ error: "source not found", status: 404 }`. Otherwise return `{ ok: true, id }`. Widen the return type if `HandlerError` is not already in it. An empty id still returns 400.

**Verify**: `pnpm exec biome lint apps/web/worker/admin/handlers.ts` → exit 0

### Step 2: Test both results

In `admin.test.ts`, call `deleteSource` with a fake DB whose `run()` returns `{ meta: { changes: 1 } }` and expect `ok: true`. A second call with `changes: 0` expects status 404 and no `ok: true`.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/admin.test.ts` → all pass.

## Test plan

Call `deleteSource`. Do not assert against a copy of the SQL string alone.

## Done criteria

- [ ] `changes === 0` returns 404
- [ ] `changes === 1` returns `{ ok: true, id }`
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0

## STOP conditions

- The excerpt does not match.
- `run()` in this codebase does not expose `meta.changes`. Stop and report the result type.
- The targeted test fails twice.

## Maintenance notes

Callers that treated every delete as success will now surface a 404. That is the fix.
