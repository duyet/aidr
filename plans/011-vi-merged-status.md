# Plan 011: Vietnamese status chart names a merged item

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/lib/lang.ts apps/web/src/lib/lang.test.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/407

## Why this matters

`/data` renders "By status" with `statusLabel` from `apps/web/src/lib/lang.ts`. The query is `SELECT status AS name, COUNT(*) FROM items GROUP BY status`, so `merged` is a real bar. The Vietnamese map has `new`, `published`, `rejected`, `pending`, and `accepted`, and no `merged`. On `lang=vi` that bar stays the raw English word `merged`. Unrecognized statuses must still fall back to the raw value.

## Current state

```ts
// apps/web/src/lib/lang.ts:226-239
const STATUS_LABELS_VI: Record<string, string> = {
  new: "Mới",
  published: "Đã đăng",
  rejected: "Từ chối",
  pending: "Đang chờ",
  accepted: "Đã duyệt",
};

/** Localizes an items.status value (used by /system's "items by status"
 * chart) — unrecognized statuses fall back to the raw DB value rather than
 * guessing a translation. */
export function statusLabel(name: string, lang: Lang): string {
  if (lang !== "vi") return name;
  return STATUS_LABELS_VI[name] ?? name;
}
```

`apps/web/src/components/system/ContentTab.tsx` maps `itemsByStatus` through this function. Do not edit the component. There is a different `statusLabel` in `apps/web/src/components/system/run-details-copy.ts` for run steps (`ok` / `error`). Do not edit that one.

`apps/web/src/lib/lang.test.ts` already imports from `./lang`. Add the assertion there.

Item statuses written by ingest are `new`, `published`, `rejected`, and `merged` (`apps/web/worker/ingest/write.ts` sets `status = 'merged'`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/lib/lang.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/lib/lang.ts apps/web/src/lib/lang.test.ts` | exit 0 |

Do not run the full web test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/src/lib/lang.ts`
- `apps/web/src/lib/lang.test.ts`

**Out of scope**:
- `ContentTab.tsx`, `run-details-copy.ts`, ingest status strings.

## Git workflow

- Branch: `advisor/011-vi-merged-status`
- Commit: `fix(web): name merged items in Vietnamese`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Add the label

Add `merged: "Đã gộp"` to `STATUS_LABELS_VI`. Do not translate unknown keys. Do not change English (`lang !== "vi"` still returns the raw name).

**Verify**: `pnpm exec biome lint apps/web/src/lib/lang.ts` → exit 0

### Step 2: Test it

In `lang.test.ts`, assert `statusLabel("merged", "vi")` is `Đã gộp`, `statusLabel("merged", "en")` is `merged`, and `statusLabel("not-a-status", "vi")` is `not-a-status`.

**Verify**: `pnpm --filter @aidr/web exec vitest run src/lib/lang.test.ts` → all pass.

## Test plan

Call the exported `statusLabel` from `src/lib/lang.ts`. Do not assert against `run-details-copy.ts`.

## Done criteria

- [ ] `statusLabel("merged", "vi")` is `Đã gộp`
- [ ] Unknown statuses and English stay raw
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0

## STOP conditions

- The `STATUS_LABELS_VI` excerpt does not match.
- `merged` is already in the map.
- The targeted test fails twice.

## Maintenance notes

If a new `items.status` value is written, add it here only when the Vietnamese chart should name it. Leave suggestion statuses (`pending`, `accepted`) as they are; they are unused by the items query but already shipped.
