# Plan 027: A failed re-translation does not reject an approved suggestion

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/suggestions.ts apps/web/worker/__tests__/suggestions.test.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/423

## Why this matters

`approveSuggestionById` is the admin Approve path. When the guided re-translation returns nothing, the suggestion is stored as `rejected` with the note "human approved but re-translation failed". Reject and approve both require `pending` or `needs_review`. A retry cannot find the row. The human already approved it. A model miss should leave it reviewable.

## Current state

```ts
// apps/web/worker/suggestions.ts:1356-1366
  if (!rewritten) {
    await prepareVerdict(
      env,
      id,
      "rejected",
      1,
      "human approved but re-translation failed",
      null
    ).run();
    return { ok: false, error: "re-translation failed" };
  }
```

`checkAppliedText` refusal just above returns `{ ok: false }` without changing status. Match that: do not write `rejected`. Set status to `needs_review` only if it is not already that. If `prepareVerdict` cannot write `needs_review`, use the existing update that sets status, and STOP if `needs_review` is not a stored status (it is, in the review flow).

`field === "auto"` goes to `approveUnifiedSuggestion`. Do not change that function in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/suggestions.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/suggestions.ts apps/web/worker/__tests__/suggestions.test.ts` | exit 0 |

Do not run the full web suite or `check-types`. If the suggestions test file has another name, use the file that already imports `approveSuggestionById` or create `worker/__tests__/suggestion-approve.test.ts`.

## Scope

**In scope**:
- `apps/web/worker/suggestions.ts` (`approveSuggestionById` only)
- one suggestions test file

**Out of scope**:
- `approveUnifiedSuggestion`, the admin route, translation prompts.

## Git workflow

- Branch: `advisor/027-approval-needs-review`
- Commit: `fix(web): keep an approved suggestion when re-translation fails`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Stop rejecting

On an empty rewrite, update the row to `needs_review` with the note `human approved but re-translation failed`, and return `{ ok: false, error: "re-translation failed" }`. Do not set `rejected`. Do not apply the text.

**Verify**: `pnpm exec biome lint apps/web/worker/suggestions.ts` → exit 0

### Step 2: Test the status

Stub `retranslateFieldWithGuidance` to return no text. Call `approveSuggestionById` on a `pending` row. Expect `ok: false` and the stored status `needs_review`, not `rejected`. A second call on that `needs_review` row is allowed by the existing status guard. Assert it does not require `pending` only.

**Verify**: the targeted vitest command exits 0.

## Test plan

Call `approveSuggestionById`. The stub is the model, not the status write.

## Done criteria

- [ ] Empty re-translation stores `needs_review`, not `rejected`
- [ ] The function still returns `ok: false`
- [ ] Targeted vitest exits 0
- [ ] `approveUnifiedSuggestion` is untouched

## STOP conditions

- The excerpt does not match.
- `needs_review` is not a legal `translation_suggestions.status`. Stop.
- The targeted test fails twice.

## Maintenance notes

A later successful approve of the same row should still apply the text and set `accepted`. The guard that refuses `rejected` rows stays.
