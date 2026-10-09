# Plan 033: Replace the Remix Icon Chrome mark with one SVG

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/package.json apps/web/src/components/header/lib.ts apps/web/src/components/subscribe/ChromeChannel.tsx`
> If `RiChromeLine` is already gone, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/429

## Why this matters

`@remixicon/react` is imported only as `RiChromeLine` in four files. Every other icon is `lucide-react`. The manifest still carries a second icon package for one glyph.

## Current state

Imports:

- `apps/web/src/components/header/GetAIDRMenu.tsx`
- `apps/web/src/components/header/lib.ts` (`icon: RiChromeLine`)
- `apps/web/src/components/subscribe/DeliverPage.tsx`
- `apps/web/src/components/subscribe/ChromeChannel.tsx`

`apps/web/package.json` depends on `@remixicon/react`. `apps/web/src/lib/chrome-copy.test.ts` expects the header source to contain the string `RiChromeLine`. `apps/web/src/lib/chrome.test.ts` expects rendered HTML not to contain `<RiChromeLine`. Update those assertions to the new component name. Do not delete the tests.

The glyph is a Chrome mark in the header and on the subscribe page. Keep `aria-hidden` and the existing `className` (`size-4`, `size-5`, `mr-2`) at each call site. A 24-viewBox stroke icon matches the header. Draw a simple circle-and-center mark. Do not copy the Remix Icon path data.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/lib/chrome.test.ts src/lib/chrome-copy.test.ts src/components/header/lib.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/components/header apps/web/src/components/subscribe/ChromeChannel.tsx apps/web/src/components/subscribe/DeliverPage.tsx` | exit 0 |

Drop a test path that does not exist. Do not run the full suite or `check-types`. Do not run `pnpm install` unless removing the dependency fails the lockfile check you already have a script for. Run `pnpm install` once if `package.json` changes, from the repo root, so the lockfile updates. That is the one install this plan allows.

## Scope

**In scope**:
- the four call sites
- `apps/web/src/components/header/ChromeMark.tsx` (create)
- `apps/web/package.json` and `pnpm-lock.yaml` (remove `@remixicon/react` only)
- the two chrome tests that mention `RiChromeLine`

**Out of scope**:
- other icons, lucide, subscribe layout.

## Git workflow

- Branch: `advisor/033-drop-remixicon`
- Commit: `chore(web): drop the Remix Icon dependency`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Add the mark and switch call sites

Export `ChromeMark` as an SVG component that accepts `className` and spreads the rest of the SVG props, with `aria-hidden` defaulting true. Replace every `RiChromeLine` with it. `header/lib.ts` stores the component as `icon`. That assignment must still be a component.

**Verify**: `rg -n "RiChromeLine|@remixicon/react" apps/web/src` → no matches.

### Step 2: Remove the dependency and fix the tests

Remove `@remixicon/react` from `apps/web/package.json`. Run `pnpm install` at the repo root so the lockfile drops it. Update chrome tests to look for `ChromeMark` instead of `RiChromeLine`.

**Verify**: `rg -n "@remixicon/react" apps/web/package.json pnpm-lock.yaml` → no matches. The targeted vitest command exits 0.

## Test plan

The chrome-copy test reads source text. Update the needle to `ChromeMark`. `chrome.test.ts` still renders the header and expects the old element name to be absent. Also expect the new mark's SVG to be present if the test renders that menu. Do not delete the render test.

## Done criteria

- [ ] No `RiChromeLine` or `@remixicon/react` import remains under `apps/web`
- [ ] The lockfile no longer lists `@remixicon/react`
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the touched TSX files exits 0

## STOP conditions

- A fifth production import of `@remixicon/react` exists outside the four files. Stop and include it, or report it.
- `pnpm install` changes dependencies other than `@remixicon/react` and its unused transitive packages. Revert the unrelated lockfile hunks. If you cannot separate them, STOP.
- The targeted test fails twice.

## Maintenance notes

New header icons should use `lucide-react` or a local SVG. Do not add another icon package for one glyph.
