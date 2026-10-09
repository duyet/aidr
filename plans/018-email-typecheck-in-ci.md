# Plan 018: Root typecheck includes the email Worker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- package.json apps/email/package.json`
> If root `check-types` is no longer only `@aidr/web`, STOP and re-read it.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/414

## Why this matters

CI runs `pnpm run check-types` (`.github/workflows/ci.yml`). That script is `pnpm --filter @aidr/web check-types`. `@aidr/email` has its own `check-types` (`tsc --noEmit`) and it already exits 0, but a type error in the inbound-mail Worker stays green on CI. Lint and `pnpm -r test` do run for it. This plan only adds the typecheck. It does not deploy the email Worker.

## Current state

```json
// package.json scripts
"check-types": "pnpm --filter @aidr/web check-types",
```

```json
// apps/email/package.json
"name": "@aidr/email",
"check-types": "tsc --noEmit"
```

`.github/workflows/ci.yml` calls `pnpm run check-types`. Do not edit the workflow if the root script is what it runs.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Email types | `pnpm --filter @aidr/email check-types` | exit 0 |
| Script check | `node -e "const s=require('./package.json').scripts['check-types']; if(!s.includes('@aidr/email')||!s.includes('@aidr/web')) process.exit(1)"` | exit 0 |

Do not run `pnpm --filter @aidr/web check-types` or the full web test suite. Those are the OOM risk this repo already hit.

## Scope

**In scope**:
- `package.json` (root)

**Out of scope**:
- `apps/email/**` source, deploy workflows, `apps/web/package.json`.

## Git workflow

- Branch: `advisor/018-email-typecheck`
- Commit: `ci: typecheck the email worker with the web app`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Chain the email typecheck

Change root `check-types` so it runs both filters. Keep `@aidr/web` in the command. A straightforward form:

```json
"check-types": "pnpm --filter @aidr/web --filter @aidr/email check-types"
```

Confirm `pnpm --filter` accepts repeated `--filter` in this repo's pnpm 12. If it does not, use `pnpm --filter @aidr/web check-types && pnpm --filter @aidr/email check-types`.

**Verify**: the node one-liner in the command table exits 0, and `pnpm --filter @aidr/email check-types` exits 0.

## Test plan

No new test file. The email package's `tsc --noEmit` is the check that the package still typechecks. The node one-liner is the check that CI will invoke it, because CI runs the root script.

## Done criteria

- [ ] Root `check-types` names both `@aidr/web` and `@aidr/email`
- [ ] `pnpm --filter @aidr/email check-types` exits 0
- [ ] No file under `apps/email/src` is modified
- [ ] No deploy workflow is modified

## STOP conditions

- `pnpm --filter @aidr/email check-types` exits non-zero before your edit. Stop and report the tsc errors. Do not start fixing them in this plan.
- Root `check-types` already includes `@aidr/email`. Stop.
- The only way to include it is to edit `ci.yml` because CI does not call `pnpm run check-types`. Stop and report that.

## Maintenance notes

A later email deploy job is out of scope. Do not add `apps/email` to `deploy-web.yml` here.
