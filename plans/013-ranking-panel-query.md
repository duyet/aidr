# Plan 013: The ranking panel request keeps lang and ranking as two parameters

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/components/story/StoryRankingPanel.tsx apps/web/src/lib/slug.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/409

## Why this matters

"Why this ranks" fetches `/api/story` plus `storyPath(item, lang)` plus `?ranking=1`. `storyPath` already returns `/{id}?lang=vi` (or `en`) via `withLang`. The second `?` becomes part of the `lang` value, so `ranking` is not a query parameter. The route only loads ranking when `searchParams.get("ranking") === "1"`. The panel then ends on "Could not load ranking details."

## Current state

```ts
// apps/web/src/lib/slug.ts:5-8
export function storyPath(item: Pick<FeedItem, "id">, lang?: Lang): string {
  const path = `/${item.id.slice(0, 8)}`;
  return lang ? withLang(path, lang) : path;
}
```

```tsx
// apps/web/src/components/story/StoryRankingPanel.tsx:54
    fetch(`/api/story${storyPath(item, lang)}?ranking=1`)
```

`withLang` (`apps/web/src/lib/locale-url.ts`) sets one `lang` parameter and preserves unrelated ones. `StoryRow.tsx` fetches `/api/story${storyPath(item, requestedLang)}` without a second `?`. Leave `StoryRow` alone.

The route is `apps/web/src/routes/api/story.$id.ts`. It reads `ranking` from `searchParams`. Do not edit the route.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/lib/slug.test.ts src/components/story/StoryRankingPanel.test.tsx` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/lib/slug.ts apps/web/src/components/story/StoryRankingPanel.tsx apps/web/src/components/story/StoryRankingPanel.test.tsx` | exit 0 |

Do not run the full web test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/src/lib/slug.ts` (only if you add a helper; prefer not to)
- `apps/web/src/components/story/StoryRankingPanel.tsx`
- `apps/web/src/components/story/StoryRankingPanel.test.tsx` (create)

**Out of scope**:
- `StoryRow.tsx`, `story.$id.ts`, ranking copy, day bounds.

## Git workflow

- Branch: `advisor/013-ranking-panel-query`
- Commit: `fix(web): request story ranking with both query parameters`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Build one URL

In the panel, build the fetch URL so `lang` and `ranking` are both search params. Use `URL` / `URLSearchParams` against a base of `https://aidr.today` (or `storyPath` plus `URL.searchParams.set("ranking", "1")` on a `URL` constructed from that path). The path must stay `/api/story/` plus the 8-character id. Do not concatenate a second `?`.

Export a pure helper from the panel file, for example `rankingRequestPath(item, lang)`, so a test can call it without rendering.

**Verify**: `pnpm exec biome lint apps/web/src/components/story/StoryRankingPanel.tsx` → exit 0

### Step 2: Test both languages

Create `StoryRankingPanel.test.tsx` (or `.ts` if you do not render). For an item id starting `abcdef12` and lang `vi`, expect the path's query to parse as `lang=vi` and `ranking=1`, and the pathname to be `/api/story/abcdef12`. Repeat for `en`. Assert the string does not contain `?lang=vi?`.

**Verify**: `pnpm --filter @aidr/web exec vitest run src/components/story/StoryRankingPanel.test.tsx` → all pass.

## Test plan

Call the exported helper. Do not mock `fetch`. A string that still has two `?` must fail the test.

## Done criteria

- [ ] `lang` and `ranking=1` are separate parameters for both `en` and `vi`
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the in-scope files exits 0
- [ ] `StoryRow.tsx` is untouched

## STOP conditions

- `storyPath` no longer appends `?lang=`. Stop and re-read it; the bug may already be fixed.
- The route no longer checks `ranking === "1"`. Stop.
- The targeted test fails twice.

## Maintenance notes

Any new query flag on this fetch must go through `searchParams.set`, not string concatenation onto `storyPath`.
