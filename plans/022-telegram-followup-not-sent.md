# Plan 022: A rejected Telegram digest tail is not stored as sent

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/notify/telegram.ts apps/web/worker/__tests__/notify.test.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/418

## Why this matters

The digest sender posts a lead, then follow-up pages. An ambiguous or budget-exhausted follow-up already returns `ok: false` with `ambiguous: true`, so the day is not stored as a clean send. A definite Telegram rejection of a follow-up is only logged. If the lead set `firstId`, the function still returns `ok: true`. `recordDelivery` then stores the digest as `sent`, and the next run treats it as `already_sent`. The missing tail is never retried.

## Current state

```ts
// apps/web/worker/notify/telegram.ts:670-679
        if (!page.photo) {
          const text = await sendCaption();
          if (index > 0 && (text.ambiguous || text.budgetExhausted)) {
            return unresolvedFollowUp(text);
          }
          if (!text.ok) {
            console.error(
              `telegram digest follow-up failed: ${text.description}`
            );
          }
          continue;
        }
```

The photo follow-up at lines 695–711 does the same: a definite text failure after a rejected photo logs and `continue`s. Line 728–729 then returns `ok: true` when `firstId` is set.

`unresolvedFollowUp` is the existing result for a tail that must not be retried as a full digest and must not count as a clean send. Reuse it for a definite follow-up failure too. Do not return `ok: true` after a failed tail. Do not retry the lead inside this function.

The lead page (`index === 0`) keeps today's behavior: a definite photo rejection may fall back to text, and a failed lead returns `sendFailure`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/notify.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/notify/telegram.ts apps/web/worker/__tests__/notify.test.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/notify/telegram.ts`
- `apps/web/worker/__tests__/notify.test.ts`

**Out of scope**:
- `recordDelivery`, trending, Facebook, the caption builder.

## Git workflow

- Branch: `advisor/022-telegram-followup`
- Commit: `fix(web): do not mark a partial Telegram digest as sent`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Fail the send when a follow-up is rejected

For `index > 0`, any `!ok` result (text page, photo, or the text fallback after a rejected photo) must return `unresolvedFollowUp(...)`. Delete the log-and-`continue` path for those failures. Keep the ambiguous and budget branches returning that same result. A follow-up that succeeds still `continue`s. The final `return { ok: true, messageId: firstId }` runs only when every page succeeded.

**Verify**: `pnpm exec biome lint apps/web/worker/notify/telegram.ts` → exit 0

### Step 2: Test a rejected second page

Find the existing digest send test in `notify.test.ts` and copy its Telegram fetch mock. Two pages: the first `sendPhoto` or `sendMessage` succeeds with a message id, the second returns a definite error (`ok: false` in the Bot API body, not a timeout). Expect the notifier result `ok: false` and `ambiguous: true`. Expect the lead request to have been made once, not twice.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/notify.test.ts` → all pass.

## Test plan

Drive `telegramNotifier.sendDigest` (or the chat-specific notifier the existing tests use). Do not assert by reading the source.

## Done criteria

- [ ] A definite follow-up failure returns `ok: false` and `ambiguous: true`
- [ ] The lead is not posted a second time in that test
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0

## STOP conditions

- The follow-up excerpt does not match.
- Returning `ambiguous: true` would make `recordDelivery` retry the whole digest including the lead. Read `recordDelivery` first. If a non-ok ambiguous result is retried as a new lead, STOP and report. Do not invent a new status column.
- The targeted test fails twice.

## Maintenance notes

A later partial-send record (tail only) is out of scope. This plan only stops a missing tail from looking complete.
