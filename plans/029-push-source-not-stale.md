# Plan 029: Every push source stays off the stale streak

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/source-health.ts apps/web/src/lib/system-queries.ts apps/web/worker/__tests__/source-health.test.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/425

## Why this matters

The dashboard treats every `type === "push"` source as not stale. The writer only exempts the id `user`. `upsertSource` accepts `type: "push"` for any id. An operator push source is never fetched, so `carrySourceEmptyRuns` increments `emptyRuns` every run, while `/data` will not mark it stale. The two sides disagree. The comments both say push is the no-adapter type. The writer should follow the reader: every push id stays at 0.

## Current state

```ts
// apps/web/worker/source-health.ts:120-126
export function isSourceStale(health: SourceRunHealth, id: string): boolean {
  if (health.skipReason === "disabled") return false;
  if (id === USER_SOURCE_ID) return false;
  return health.emptyRuns >= staleAfterRunsFor(id);
}
```

```ts
// apps/web/worker/source-health.ts:204-207
      emptyRuns:
        id === USER_SOURCE_ID
          ? 0
          : nextEmptyRuns(previous[id]?.emptyRuns ?? 0, health.fetched),
```

```ts
// apps/web/src/lib/system-queries.ts:1305-1308
    const isStale =
      source.type !== "push" &&
      parsed.skipReason !== "disabled" &&
      parsed.emptyRuns >= threshold;
```

`USER_SOURCE_ID` is `"user"`. Keep that id exempt even if a caller forgets the type. Add the type.

`carrySourceEmptyRuns` does not receive source types today. Pass a `ReadonlySet<string>` of push ids, or a `Record<string, string>` of id to type. Update every caller. Grep `carrySourceEmptyRuns(` and `isSourceStale(` and update them in the same change. If a caller has no type map, pass an empty set and keep the `user` id exemption so behavior does not get worse.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/source-health.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/source-health.ts apps/web/src/lib/system-queries.ts apps/web/worker/__tests__/source-health.test.ts` | exit 0 |

Do not run the full web suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/source-health.ts`
- its callers, only to pass the new argument
- `apps/web/worker/__tests__/source-health.test.ts`
- `apps/web/src/lib/system-queries.ts` only if the reader comment must say "every push id", not a behavior change (the reader is already correct)

**Out of scope**:
- `upsertSource`, catalog seed, stale thresholds.

## Git workflow

- Branch: `advisor/029-push-source-stale`
- Commit: `fix(web): do not age operator push sources`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Exempt push ids in the writer

`isSourceStale(health, id, type?)` returns false when `type === "push"` or `id === USER_SOURCE_ID`. `carrySourceEmptyRuns` takes the push id set and forces `emptyRuns` to 0 for those ids and for `user`. Wire the ingest caller to pass ids whose source row `type` is `push`.

**Verify**: `pnpm exec biome lint apps/web/worker/source-health.ts` → exit 0

### Step 2: Test an external push id

Add a case next to the existing `user` test. Id `external`, type `push`, fetched 0, previous emptyRuns 3. Expect the carried `emptyRuns` to be 0 and `isSourceStale` to be false. Id `external` with type `rss` and the same streak still increments and can be stale.

**Verify**: the targeted vitest command exits 0.

## Test plan

Call `carrySourceEmptyRuns` and `isSourceStale`. Do not reimplement the exemption in the test.

## Done criteria

- [ ] A push id other than `user` stays at `emptyRuns` 0
- [ ] An rss id still increments
- [ ] `user` stays exempt
- [ ] Targeted vitest exits 0

## STOP conditions

- The excerpts do not match.
- A caller of `carrySourceEmptyRuns` cannot know source types without a new query you cannot see. Pass the set from the rows the step already loaded. If those rows have no `type`, STOP.
- The targeted test fails twice.

## Maintenance notes

The dashboard rule stays "type is push". The writer now matches it. A typo'd type is not `push` and still goes stale.
