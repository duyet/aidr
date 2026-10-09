# Plan 020: Operator docs say the ingest alarm is 30 minutes and name Facebook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- README.md CLAUDE.md apps/web/ALGORITHM.md docs/decisions/threat-model-and-release-checklist.md apps/web/worker/ingest-schedule.ts`
> If `INGEST_ALARM_INTERVAL_MS` is not `30 * 60 * 1000`, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/416

## Why this matters

`NewsIngestScheduler` starts a run every 30 minutes (`INGEST_ALARM_INTERVAL_MS`). `apps/web/ALGORITHM.md` says that under "Scheduling & coalesce", then the overview still says "One hourly run". The root README, `CLAUDE.md`, and the release checklist repeat the hourly clock. Someone waiting an hour after a dry run, or treating a second run in the same hour as a bug, follows the wrong clock. The root README also says trending posts stay on Telegram. `facebookEnNotifier` is registered and ALGORITHM.md already describes the English Page. The entry-point docs omit it.

## Current state

```ts
// apps/web/worker/ingest-schedule.ts:23-27
export const INGEST_MIN_INTERVAL_MS = 25 * 60 * 1000;
export const INGEST_ALARM_INTERVAL_MS = 30 * 60 * 1000;
```

```md
# README.md:49
One hourly `NewsIngestWorkflow`. The contract is [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md).
```

```md
# README.md:53
3. **Publish** — one edition per language (`worker/digest/edition.ts`). Email uses the subscriber's timezone from 07:00 and their digest size. Telegram VI and Telegram EN each post once from 08:00 `Asia/Ho_Chi_Minh`. A missing language column is skipped and retried; it is not filled from the other language. Trending posts stay on Telegram.
```

```md
# CLAUDE.md:7
Read [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md) before changing ingest, ranking, prompts, admin/MCP, or notify surfaces. One hourly run consumes sources, ranks items, writes `tldr_snapshots`, then publishes that edition to email and Telegram. Language columns do not fall back to each other (`worker/digest/edition.ts`).
```

```md
# CLAUDE.md:14
- Deploy: `pnpm --filter @aidr/web deploy` or `pnpm run cf:deploy:prod`. D1 and Worker secrets use the `cf` CLI. `wrangler deploy` still uploads the Worker: `cf migrate` (cf 1.0.0-beta.5) drops Workflow and Durable Object bindings, which the hourly ingest needs. Config stays `apps/web/wrangler.toml`.
```

```md
# apps/web/ALGORITHM.md:32
One hourly run does three jobs. Prompts live in `worker/llm.ts`; the steps live in `worker/ingest/` (one module per step), run in order by `worker/workflow.ts`.
```

```md
# apps/web/ALGORITHM.md:46
An empty `bullets_vi` or `bullets_en` means that language is not ready. The channel skips and the next hourly run retries. Email is not a `Notifier`: a notifier is one target plus a trending post.
```

```md
# docs/decisions/threat-model-and-release-checklist.md:62
   `GET /api/health`, and one hourly run reaching email and Telegram.
```

Leave the "Scheduling & coalesce" section as it is. It is already correct. Do not edit `apps/web/worker/README.md` (plan 017 owns that file). Do not edit `apps/web/src/lib/site.ts` (plan 016). Do not change `INGEST_ALARM_INTERVAL_MS`. Do not change the cf 1.0.0-beta.5 warning except the words "hourly ingest", which become "30-minute ingest". Do not drop the `cf migrate` warning.

Email 07:00 and Telegram 08:00 stay local-time gates. They are not the ingest period.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Doc check | `rg -n "One hourly|hourly run|hourly ingest|Trending posts stay on Telegram" README.md CLAUDE.md apps/web/ALGORITHM.md docs/decisions/threat-model-and-release-checklist.md` | no matches |

No test suite. Do not run `pnpm --filter @aidr/web test`.

## Scope

**In scope**:
- `README.md`
- `CLAUDE.md`
- `apps/web/ALGORITHM.md` (only the two sentences in Current state)
- `docs/decisions/threat-model-and-release-checklist.md` (only the post-deploy bullet)

**Out of scope**:
- `apps/web/worker/README.md`, `apps/web/src/**`, `ingest-schedule.ts`, the Scheduling section of ALGORITHM.md, the model-bench section.

## Git workflow

- Branch: `advisor/020-operator-docs-30-minutes`
- Commit: `docs: describe the 30-minute ingest and the Facebook page`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Replace the clock and name the Page

In each in-scope sentence that says a run is hourly, say the scheduler starts a run every 30 minutes, with a 25-minute coalesce (`INGEST_MIN_INTERVAL_MS`). Keep the pointer at ALGORITHM.md.

In the root README publish bullet, add the English Facebook Page (`facebook-en`) next to Telegram VI and Telegram EN, from 08:00 `Asia/Ho_Chi_Minh`, same trending bar. Delete "Trending posts stay on Telegram."

In CLAUDE.md, the publish list is email, Telegram, and the English Facebook Page. Language columns still do not fall back.

In the release checklist, the post-deploy check is one ingest run (the 30-minute alarm) reaching email, Telegram, and, when the Page is configured, Facebook. Do not require Facebook when the Page token is unset.

In ALGORITHM.md line 32, say one ingest run does three jobs, and that the scheduler starts one every 30 minutes. On line 46, say the next run retries. Do not rewrite the Facebook bullet that is already there.

**Verify**: the `rg` command in the table prints no matches.

### Step 2: No code drift

**Verify**: `git diff --stat -- apps/web/worker apps/web/src` → empty. `git diff --stat -- apps/web/worker/README.md` → empty.

## Test plan

Documentation only. `rg` is the check.

## Done criteria

- [ ] The four files no longer say the ingest run is hourly
- [ ] Root README and CLAUDE.md name `facebook-en`
- [ ] "Trending posts stay on Telegram." is gone
- [ ] No TypeScript file is modified
- [ ] `apps/web/worker/README.md` is unmodified

## STOP conditions

- `INGEST_ALARM_INTERVAL_MS` is not 30 minutes. Stop.
- An excerpt does not match. Stop.
- You would need to edit `worker/README.md` or `site.ts`. Stop and leave those to plans 017 and 016.

## Maintenance notes

When the alarm interval changes, update these entry points and the Scheduling section together. The 07:00 email gate and the 08:00 Telegram/Facebook gate are not the ingest interval.
