# Plan 001: Green CI by excluding dither-kit from Biome format

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat b4168a5..HEAD -- biome.json apps/web/src/components/dither-kit apps/web/package.json .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `b4168a5`, 2026-09-04

## Why this matters

Master CI (`.github/workflows/ci.yml`) runs `pnpm run lint` first. Web lint is
`biome check .`, which **formats and lints**. `dither-kit` is a vendored chart
engine that omits semicolons; Biome `semicolons: "always"` reports ~75 format
errors. Test and typecheck never run on GitHub. Local `pnpm --filter @aidr/web test`
is green (703 tests at this SHA).

## Current state

- `biome.json` `files.includes` already excludes `routeTree.gen.ts` and `public`.
- `javascript.formatter.semicolons` is `"always"` (`biome.json` around line 53).
- `apps/web/package.json` script `"lint": "biome check ."`.
- Vendor lockfile: `apps/web/dither-kit.json` — do **not** reformat the TS/TSX
  under `apps/web/src/components/dither-kit/` or hashes drift.
- Other lint errors exist (a11y, organizeImports) outside dither-kit. This plan
  only excludes dither-kit format. If `pnpm --filter @aidr/web lint` still fails
  after the exclude, report remaining diagnostics; do not mass-format the repo.

Conventions: conventional commits (`fix(ci): …`). Match existing `biome.json`
ignore style (`!**/path`).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Lint web  | `export PATH="/home/box/.local/node-v22.22.1-linux-x64/bin:$PATH"` then `pnpm --filter @aidr/web lint` | exit 0, or only non-dither-kit issues listed in your report |
| Types     | `pnpm --filter @aidr/web check-types` | exit 0 |
| Tests     | `pnpm --filter @aidr/web test` | all pass |

Node 20 on PATH cannot run this repo's pnpm; use Node 22 as above.

## Scope

**In scope**
- `biome.json`

**Out of scope**
- Reformatting `apps/web/src/components/dither-kit/**`
- Changing `dither-kit.json` hashes
- Fixing unrelated a11y/import-order errors unless they are the *only* thing
  left after the exclude (then STOP and list them)

## Git workflow

- Branch: `advisor/001-green-ci-exclude-dither-kit` or commit on master if the
  operator already asked for frequent pushes to master.
- Commit: `fix(ci): exclude vendored dither-kit from biome format`
- Do not force-push. Push via HTTPS if `ssh` is missing:
  `git -c "url.https://x-access-token:$(gh auth token)@github.com/.insteadOf=git@github.com:" push`

## Steps

### Step 1: Exclude the vendor tree

In `biome.json` `files.includes`, add:

```json
"!**/src/components/dither-kit/**"
```

Keep the existing `!**/routeTree.gen.ts` and `!**/public` entries.

**Verify**: `pnpm exec biome check apps/web/src/components/dither-kit/area-chart.tsx`
→ no format diagnostics for that file (ignored).

### Step 2: Run web lint

**Verify**: `pnpm --filter @aidr/web lint`

- If exit 0: done.
- If remaining errors are **not** in `dither-kit`, copy the reporter summary
  into the PR body and STOP (do not drive-by format the rest of the app).

### Step 3: Confirm tests/types still pass

**Verify**: `pnpm --filter @aidr/web check-types` and `pnpm --filter @aidr/web test`
→ exit 0.

## Test plan

- No new tests. CI lint going green is the check.
- Do not add a snapshot of biome output.

## Done criteria

- [ ] `biome.json` includes `!**/src/components/dither-kit/**`
- [ ] `git diff` does not reformat dither-kit sources
- [ ] `pnpm --filter @aidr/web lint` either exits 0 or the leftover files are
      listed in the commit/PR (not dither-kit)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Someone already reformatted dither-kit or changed `dither-kit.json`.
- Lint still fails only because of files this plan marked out of scope.

## Maintenance notes

- If dither-kit is replaced with a maintained package, drop the ignore.
- Reviewers: reject any commit that `biome format --write`s dither-kit without
  updating `dither-kit.json`.
