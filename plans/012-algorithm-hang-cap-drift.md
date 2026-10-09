# Plan 012: Ops pitfalls in ALGORITHM.md match the hang caps in code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/ALGORITHM.md apps/web/worker/llm.ts apps/web/worker/ingest/context.ts apps/web/worker/sources/catalog.ts`
> If the cited lines moved, update only the doc sentences this plan names, after re-reading the constants. If the constants themselves differ from the excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/408

## Why this matters

`apps/web/ALGORITHM.md` is the doc agents read before changing ingest. The "Ops pitfalls" section still says every LLM-heavy step uses `retries: 0`, that TL;DR hangs at 90s, and that translate stays at 25s. The code and a later section of the same file disagree. An operator who trusts the pitfalls section will "fix" a healthy 135s TL;DR cap back down and time out the edition. The same section's flood-gate paragraph says `marketbrief` has no `maxItems`, while the catalog sets `maxItems: 6`.

## Current state

Doc, which is wrong:

```md
# apps/web/ALGORITHM.md:207-210
- LLM-heavy Workflow steps use `retries: 0`. `LLM_STEP` and
  `BACKFILL_TRANSLATE_STEP` time out at 5 minutes, above
  `TRANSLATE_TIMEOUT_MS`, so a slow translate can return and write. A
  failed score/TL;DR call must not abort close-run.
```

```md
# apps/web/ALGORITHM.md:229
- Score and TL;DR hang-cap per model at 70s/90s (translate stays 25s).
```

```md
# apps/web/ALGORITHM.md:276-278
- **Feed share cap.** The flood gate only bounds new rows, and a source
  without `maxItems` (e.g. `marketbrief`) can still dominate. `getFeed`
```

Code, which is right:

```ts
// apps/web/worker/ingest/context.ts:47-62
export const LLM_STEP = {
  retries: { limit: 0, delay: 0 },
  timeout: "5 minutes",
} as const;

export const TLDR_STEP = {
  retries: { limit: 1, delay: 10_000 },
  timeout: "4 minutes",
} as const;
```

```ts
// apps/web/worker/llm.ts:686-700
export const MODEL_SLICE_MAX_MS = 25_000;
export const SCORE_SLICE_MAX_MS = 70_000;
export const TLDR_SLICE_MAX_MS = 135_000;
export const TRANSLATE_FIRST_TOKEN_MS = 35_000;
```

Later in the same markdown file, lines 1065–1073 already say score stays on the 70s hang-cap, TL;DR uses 135s, and translate attempts use a 60s hang-cap. Do not rewrite that later section. Only the pitfalls lines above, plus the marketbrief example.

Catalog:

```ts
// apps/web/worker/sources/catalog.ts around the marketbrief seed
id: "marketbrief",
config includes maxItems: 6,
```

Confirm the `maxItems: 6` on the `marketbrief` entry before editing the sentence. The feed-share cap paragraph may still explain that a source with no `maxItems` can dominate; it must not use `marketbrief` as that example.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Doc check | `rg -n "90s|marketbrief" apps/web/ALGORITHM.md` | no `70s/90s` and no `without \`maxItems\` (e.g. \`marketbrief\`)` |
| Lint | none required for a markdown-only edit | |

Do not change `llm.ts` or `catalog.ts` to match the stale sentences.

## Scope

**In scope**:
- `apps/web/ALGORITHM.md`

**Out of scope**:
- `llm.ts`, `context.ts`, `catalog.ts`, any test, the model-bench section of ALGORITHM.md (the later hang-cap paragraphs).

## Git workflow

- Branch: `advisor/012-algorithm-hang-caps`
- Commit: `docs(web): correct ingest hang caps in the ops pitfalls`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Rewrite the three stale sentences

In "Ops pitfalls":

- Say `LLM_STEP` and `BACKFILL_TRANSLATE_STEP` use `retries: 0` and a 5-minute timeout. Say `TLDR_STEP` uses one retry (`limit: 1`, `delay: 10_000`) and a 4-minute timeout, because a Durable Object reset used to fail the edition for the rest of the hour. Keep the sentence that a failed score/TL;DR call must not abort close-run.
- Replace the `70s/90s` / `translate stays 25s` bullet with the constants: score `SCORE_SLICE_MAX_MS` 70s, TL;DR `TLDR_SLICE_MAX_MS` 135s, translate first token `TRANSLATE_FIRST_TOKEN_MS` 35s. Point at `worker/llm.ts`. Do not invent a 25s translate cap.

In the feed-share paragraph, delete the claim that `marketbrief` has no `maxItems`. Say a source that omits `maxItems` can still dominate the served feed, and that `marketbrief` is already capped at 6 by the flood gate. Keep the 25% `capSourceShare` description intact.

**Verify**: `rg -n "70s/90s|e.g. \`marketbrief\`" apps/web/ALGORITHM.md` → no matches. `rg -n "135s|35s|maxItems: 6" apps/web/ALGORITHM.md` → the pitfalls section contains 135s and 35s.

### Step 2: No code drift

**Verify**: `git diff --stat -- apps/web/worker apps/web/src` → empty.

## Test plan

This is a documentation correction. The verification is `rg` against the file plus an empty code diff. Do not add a test that snapshots the markdown.

## Done criteria

- [ ] Ops pitfalls name TL;DR 135s, score 70s, translate first token 35s, and TLDR_STEP's one retry
- [ ] `marketbrief` is not cited as a source without `maxItems`
- [ ] `git diff --stat -- apps/web/worker apps/web/src` is empty
- [ ] The later model-bench hang-cap paragraphs are unchanged

## STOP conditions

- `SCORE_SLICE_MAX_MS`, `TLDR_SLICE_MAX_MS`, or `TRANSLATE_FIRST_TOKEN_MS` do not match the excerpts. Stop rather than writing a third set of numbers.
- The `marketbrief` catalog entry does not set `maxItems: 6`. Stop.
- You feel the constants should change. Stop. This plan only updates the doc.

## Maintenance notes

When a hang cap constant changes, update both the pitfalls bullet and the later model-bench paragraph in the same commit. Reviewers should check this plan did not "simplify" the 135s TL;DR cap.
