# Plan 015: Story clocks use the Asia/Ho_Chi_Minh zone

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/components/story/lib.ts`
> On a mismatch with the excerpt, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/411

## Why this matters

`fmtTime` formats `published_at` with `toLocaleString` and no `timeZone`. The Worker SSR default is UTC. After hydration the browser zone replaces it, so the clock jumps. The product day is Asia/Ho_Chi_Minh (`AUDIENCE_TIMEZONE` in `apps/web/worker/time.ts`, also used by `day-archive.ts`). The story aside and the source list both call `fmtTime`, so they disagree with the day heading next to the story.

## Current state

```ts
// apps/web/src/components/story/lib.ts:3-8
export function fmtTime(epochSec: number, lang: Lang): string {
  return new Date(epochSec * 1000).toLocaleString(
    lang === "vi" ? "vi-VN" : "en-US",
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
  );
}
```

Callers: `StoryMetaAside.tsx` and `StorySources.tsx`. Do not edit them. `story-meta.ts` has a different formatter that already forces `timeZone: "UTC"` and labels it. Leave that one UTC.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/components/story/lib.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/components/story/lib.ts src/components/story/lib.test.ts` | exit 0 |

Do not run the full web test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/src/components/story/lib.ts`
- `apps/web/src/components/story/lib.test.ts` (create)

**Out of scope**:
- `story-meta.ts`, `StoryMetaAside.tsx`, `StorySources.tsx`.

## Git workflow

- Branch: `advisor/015-story-clock-ict`
- Commit: `fix(web): format story clocks in Asia/Ho_Chi_Minh`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Pin the zone

Add `timeZone: "Asia/Ho_Chi_Minh"` to the `toLocaleString` options. Keep the locale and the existing date fields.

**Verify**: `pnpm exec biome lint apps/web/src/components/story/lib.ts` → exit 0

### Step 2: Test a known instant

Create `lib.test.ts`. `fmtTime` of `Date.parse("2026-10-05T17:30:00Z") / 1000` is 00:30 on 6 Oct in ICT (UTC+7, no DST). Assert the English result contains `Oct` and `6` and `12:30 AM` or `00:30`, whichever `en-US` with `hour: "numeric"` actually emits — compute the expected string in the test by calling `toLocaleString` with the same options including `timeZone: "Asia/Ho_Chi_Minh"`, then expect `fmtTime` to equal that. Also assert it does not equal the same options with `timeZone: "UTC"`.

That second assertion is the bug: UTC would still say Oct 5, 5:30 PM.

**Verify**: `pnpm --filter @aidr/web exec vitest run src/components/story/lib.test.ts` → all pass.

## Test plan

Call the exported `fmtTime`. The UTC comparison must use a literal `"UTC"` in the test, not a copy of `fmtTime` that forgets the zone.

## Done criteria

- [ ] `fmtTime` passes `timeZone: "Asia/Ho_Chi_Minh"`
- [ ] The test shows the ICT string differs from the UTC string for 2026-10-05T17:30:00Z
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0

## STOP conditions

- The excerpt does not match.
- `fmtTime` is no longer used by the aside or the source list. Stop and report.
- The targeted test fails twice.

## Maintenance notes

`story-meta.ts` stays UTC on purpose. Do not "unify" the two formatters in this plan.
