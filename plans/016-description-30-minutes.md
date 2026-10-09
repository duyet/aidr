# Plan 016: Public copy says the pipeline runs every 30 minutes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/lib/site.ts apps/web/src/components/story/story-ranking.ts apps/web/worker/ingest-schedule.ts`
> If `INGEST_ALARM_INTERVAL_MS` is not `30 * 60 * 1000`, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/412

## Why this matters

The scheduler alarm is 30 minutes (`INGEST_ALARM_INTERVAL_MS` in `apps/web/worker/ingest-schedule.ts`). The about page and `llms.txt` already say "every 30 minutes". The default meta description still says the site "ranks AI stories hourly", and the ranking panel says a qualifying story is "waiting for the next hourly run". Those sentences are what search engines, RSS, and the ranking panel show.

## Current state

```ts
// apps/web/worker/ingest-schedule.ts:27
export const INGEST_ALARM_INTERVAL_MS = 30 * 60 * 1000;
```

```ts
// apps/web/src/lib/site.ts:54-55
export const SITE_DESCRIPTION =
  "AI News (aidr.today) ranks AI stories hourly from HN, HuggingNews, and more. LLM-scored AI;DR digest in English and Vietnamese — every item links to the source.";
```

```ts
// apps/web/src/components/story/story-ranking.ts:20 and :34
    pending: () => "Qualifies; waiting for the next hourly run.",
    pending: () => "Đủ điều kiện; chờ lượt chạy hàng giờ tiếp theo.",
```

`apps/web/src/lib/seo.test.ts` expects `meta description` to equal `SITE_DESCRIPTION`, and line 1133 expects `SITE_DESCRIPTION` to contain `AI News (aidr.today)`. Do not hard-code a second copy of the description in the test. `apps/web/src/lib/rss.ts` uses `SITE_DESCRIPTION` as the channel description. Do not edit `rss.ts`.

Email at 07:00 and Telegram at 08:00 are local-time gates. Do not describe those as the ingest period.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/lib/seo.test.ts src/components/story/story-ranking.test.ts worker/__tests__/story-ranking.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/lib/site.ts apps/web/src/components/story/story-ranking.ts` | exit 0 |

`story-ranking.test.ts` under `src/components/story/` may not exist. If the pending sentence has no test, add one next to `story-ranking.ts` only when an existing test file already imports `REASON_COPY` or the sentence helper. Otherwise assert via the exported function that returns the pending sentence. Read `story-ranking.ts` for that function's name (`reasonSentence` or similar) before writing the test. Do not run the full suite or `check-types`.

## Scope

**In scope**:
- `apps/web/src/lib/site.ts`
- `apps/web/src/components/story/story-ranking.ts`
- a test file only if one already covers the pending sentence, or a new `apps/web/src/components/story/story-ranking.copy.test.ts`

**Out of scope**:
- `ingest-schedule.ts` constants, `about.tsx`, `llms-txt.ts`, README, CLAUDE.md, ALGORITHM.md.

## Git workflow

- Branch: `advisor/016-description-30-minutes`
- Commit: `fix(web): say the pipeline runs every 30 minutes`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Change the two sentences

In `SITE_DESCRIPTION`, replace `hourly` with `every 30 minutes`. Keep the rest of the sentence, including `AI News (aidr.today)`.

In `REASON_COPY`, English pending becomes `Qualifies; waiting for the next 30-minute run.` Vietnamese pending becomes `Đủ điều kiện; chờ lượt chạy 30 phút tiếp theo.`

**Verify**: `rg -n "hourly" apps/web/src/lib/site.ts apps/web/src/components/story/story-ranking.ts` → no matches.

### Step 2: Lock the pending sentence

Add a test that calls the exported sentence function for reason `pending` in `en` and `vi` and expects the new strings. If seo.test.ts only compares against the `SITE_DESCRIPTION` constant, it stays green without an edit. If it also snapshots the word `hourly`, update that assertion to `every 30 minutes`.

**Verify**: the targeted vitest command exits 0. If `src/components/story/story-ranking.test.ts` does not exist, drop it from the command and run the file you created plus `src/lib/seo.test.ts`.

## Test plan

The pending-sentence test must call the exported copy function. Do not assert by reading the source file as text.

## Done criteria

- [ ] `SITE_DESCRIPTION` contains `every 30 minutes` and still contains `AI News (aidr.today)`
- [ ] Both pending sentences name 30 minutes and do not say hourly
- [ ] Targeted vitest exits 0
- [ ] `ingest-schedule.ts` is untouched

## STOP conditions

- `INGEST_ALARM_INTERVAL_MS` is not 30 minutes. Stop.
- The description excerpt does not match.
- The targeted test fails twice.

## Maintenance notes

Operator docs (README, CLAUDE.md, ALGORITHM overview) still say "hourly" in places. That is a separate plan. Do not expand this one into those files.
