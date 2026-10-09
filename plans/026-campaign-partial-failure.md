# Plan 026: A campaign with failed recipients stays retryable

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/mail/campaigns.ts apps/web/worker/__tests__/mail.test.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/422

## Why this matters

`sendCampaign` is the admin blast. After the loop it sets `status = 'sent'` even when `failed > 0`. The next send of a campaign already marked `sent` returns 409. Readers who never got the message cannot be retried without a manual status edit. Successful recipients are already in `email_sends` and must not be mailed again.

## Current state

```ts
// apps/web/worker/mail/campaigns.ts:351-359
  await env.DB.prepare(
    `UPDATE email_campaigns
     SET status = 'sent', sent_at = ?, sent_count = ?, failed_count = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(Date.now(), sent, failed, Date.now(), id)
    .run();

  return { ok: true, sent, failed };
```

Earlier in the same function, a non-test send of a campaign already marked `sent` returns 409. Read that guard before editing it. The send loop must skip addresses that already have an `email_sends` row with a null error for this campaign, so a retry does not double-send. If that skip is missing, add it.

`apps/web/worker/__tests__/mail.test.ts` covers `previewCampaign` only. Follow that file's D1 fake.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/mail.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/mail/campaigns.ts apps/web/worker/__tests__/mail.test.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/mail/campaigns.ts`
- `apps/web/worker/__tests__/mail.test.ts`

**Out of scope**:
- templates, the admin route file, subscribe mail.

## Git workflow

- Branch: `advisor/026-campaign-partial-failure`
- Commit: `fix(web): keep a partial campaign send retryable`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Leave status draft when someone failed

When `failed > 0`, set `status` to `draft` (or leave it unchanged if it was `draft`) and still write `sent_count` and `failed_count`. When `failed === 0` and at least one send was attempted or everyone was already sent, set `sent`. A test-address send must still not flip status. Read the test-address branch and do not change its early return.

Skip recipients that already have a successful `email_sends` row (`error IS NULL`) for this campaign.

**Verify**: `pnpm exec biome lint apps/web/worker/mail/campaigns.ts` → exit 0

### Step 2: Test mixed, empty, and retry

Using the mail test's fake DB:

- Zero confirmed subscribers → the existing 400 (or whatever the function returns today; assert that, do not invent a new code).
- One success and one failure → status stays `draft`, `failed_count` is 1.
- A second call sends only the failed address and then marks `sent` when that one succeeds.
- A campaign already `sent` with `failed_count` 0 still returns 409.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/mail.test.ts` → all pass.

## Test plan

Call `sendCampaign`. Do not update `email_campaigns` from the test and treat that as the assertion of the write. The fake DB should record the UPDATE the function runs.

## Done criteria

- [ ] `failed > 0` does not set `status = 'sent'`
- [ ] A retry does not send to addresses already recorded with a null error
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0

## STOP conditions

- The status UPDATE excerpt does not match.
- Campaign status is a CHECK constraint that rejects `draft` after `sent`. Stop.
- The targeted test fails twice.

## Maintenance notes

Operators who treated `sent` plus `failed_count > 0` as final will now see those blasts stay `draft`. That is the point. A fully successful blast is still `sent`.
