# Plan 010: GA4 daily sort must return 0 when two dates are equal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/ga4/snapshot.ts apps/web/worker/__tests__/ga4-snapshot.test.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/406

## Why this matters

`ga4Audience` picks DAU from the last day after sorting `snapshot.daily` by `date`. The comparator returns `1` when `a.date` is not strictly less than `b.date`, including when the dates are equal. `compare(a, b)` and `compare(b, a)` are then both positive, which is not a valid ordering. Two rows for the same day with different `users` can make DAU either value. DAU is defined as the latest day's users, not an arbitrary duplicate.

## Current state

```ts
// apps/web/worker/ga4/snapshot.ts:192-194
export function ga4Audience(snapshot: Ga4Snapshot): Ga4Audience {
  const daily = [...snapshot.daily].sort((a, b) => (a.date < b.date ? -1 : 1));
  const dau = daily.length ? (daily[daily.length - 1]?.users ?? null) : null;
```

`apps/web/worker/__tests__/ga4-snapshot.test.ts` already expects DAU `9` for dates `2026-09-01`, `2026-09-03`, `2026-09-02` in that input order. Keep that test green.

Dates are `YYYY-MM-DD` strings. Lexicographic compare matches calendar order.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/ga4-snapshot.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/ga4/snapshot.ts apps/web/worker/__tests__/ga4-snapshot.test.ts` | exit 0 |

Do not run the full web test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/worker/ga4/snapshot.ts`
- `apps/web/worker/__tests__/ga4-snapshot.test.ts`

**Out of scope**:
- GA4 fetch, parsing caps, the audience tab UI.

## Git workflow

- Branch: `advisor/010-ga4-dau-sort`
- Commit: `fix(web): sort equal GA4 days stably`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Fix the comparator

Replace the sort callback so it returns `-1`, `1`, or `0`:

```ts
(a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
```

When several rows share the latest date, DAU is the `users` value of the last of those rows after the stable sort (equal keys keep their incoming order). Document that in a one-line comment only if it is not obvious from the test name.

**Verify**: `pnpm exec biome lint apps/web/worker/ga4/snapshot.ts` → exit 0

### Step 2: Test a duplicate last day

Add a `ga4Audience` test whose `daily` array is:

- `{ date: "2026-09-02", users: 4, views: 1, sessions: 1 }`
- `{ date: "2026-09-03", users: 2, views: 1, sessions: 1 }`
- `{ date: "2026-09-03", users: 7, views: 1, sessions: 1 }`

Build it through `parseGa4Snapshot` the same way the existing DAU test does (spread `BASE`). Expect `audience.dau` to be `7` (the later duplicate in input order, which a stable sort keeps last). Also expect the existing "latest day" test to still expect `9`.

**Verify**: `pnpm --filter @aidr/web exec vitest run worker/__tests__/ga4-snapshot.test.ts` → all pass.

## Test plan

Call `ga4Audience(parseGa4Snapshot(...))`. Do not sort inside the test and then assert on that local sort.

## Done criteria

- [ ] The comparator returns 0 for equal dates
- [ ] The new test expects DAU 7 for the duplicated latest day
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0

## STOP conditions

- The sort excerpt does not match.
- `parseGa4Snapshot` drops duplicate dates before `ga4Audience` sees them. Stop and report that; do not also change the parser.
- The targeted test fails twice.

## Maintenance notes

If the product later wants DAU to sum users on a duplicated day, that is a different change. This plan only makes the latest-day pick well-defined.
