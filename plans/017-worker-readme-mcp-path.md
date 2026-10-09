# Plan 017: The worker README posts to /api/mcp and drops the finished re-export task

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/README.md apps/web/src/server.ts apps/web/src/routes/api/mcp.ts`
> If `server.ts` no longer exports `NewsIngestWorkflow`, or `/api/mcp` is gone, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/413

## Why this matters

`apps/web/worker/README.md` tells an operator to add a source by POSTing `https://aidr.today/api/admin/mcp`. The MCP route is `apps/web/src/routes/api/mcp.ts` at `/api/mcp`. `admin.$.ts` does not handle `mcp`. Following the sample returns 404, so a runtime source add fails. The same README has an "action needed" block telling someone to re-export `NewsIngestWorkflow` and `NewsIngestScheduler` from `src/server.ts`. Those classes are already exported at `apps/web/src/server.ts:314`.

## Current state

```md
# apps/web/worker/README.md:14
## Wiring into the build (action needed from the frontend/entry-server owner)
```

```md
# apps/web/worker/README.md:62
curl -X POST https://aidr.today/api/admin/mcp \
```

```ts
// apps/web/src/server.ts:314
export { NewsIngestScheduler, NewsIngestWorkflow };
```

```ts
// apps/web/src/routes/api/mcp.ts:18
export const Route = createFileRoute("/api/mcp")({
```

The publish table in the same README lists Telegram VI, Telegram EN, and an optional webhook. Facebook is a separate doc change. Do not add it here.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Doc check | `rg -n "api/admin/mcp|action needed" apps/web/worker/README.md` | no matches |
| Doc check | `rg -n "api/mcp" apps/web/worker/README.md` | at least one match |

No test. Do not run the web suite.

## Scope

**In scope**:
- `apps/web/worker/README.md`

**Out of scope**:
- `server.ts`, `mcp.ts`, route code, Facebook copy.

## Git workflow

- Branch: `advisor/017-worker-readme-mcp`
- Commit: `docs(web): point the source-add sample at /api/mcp`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Fix the sample and delete the finished task

Delete the "Wiring into the build" section, including the re-export instructions. In the curl sample, change the URL to `https://aidr.today/api/mcp`. Keep the bearer header, the JSON-RPC body, and `upsert_source`.

**Verify**: `rg -n "api/admin/mcp|action needed" apps/web/worker/README.md` → no matches. `rg -n "https://aidr.today/api/mcp" apps/web/worker/README.md` → one match.

### Step 2: No code drift

**Verify**: `git diff --stat -- apps/web/src apps/web/worker/*.ts` → empty.

## Test plan

Documentation only. The two `rg` commands are the check. Do not add a test that snapshots the README.

## Done criteria

- [ ] The sample URL is `https://aidr.today/api/mcp`
- [ ] The re-export "action needed" section is gone
- [ ] No TypeScript file is modified

## STOP conditions

- `export { NewsIngestScheduler, NewsIngestWorkflow }` is absent from `server.ts`. Stop. The section may still be needed.
- There is no `/api/mcp` route. Stop.
- You need to change the MCP handler to accept `/api/admin/mcp`. Stop. The doc is wrong, not the route.

## Maintenance notes

If a second MCP route is added later, update this sample in the same commit.
