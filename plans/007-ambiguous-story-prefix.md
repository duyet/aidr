# Plan 007: An ambiguous story id prefix resolves to nothing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/src/lib/story-queries.ts apps/web/src/lib/story-queries.test.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/403

## Why this matters

Story permalinks and `GET /api/story/:id` accept an id prefix. The Markdown route already refuses a prefix that matches two published stories. `getStory` asks for one row and returns it, so the HTML page and the JSON route can open an arbitrary story when two ids share the prefix. The merged-item branch in the same function already uses `LIMIT 2` and returns null unless exactly one row matches. The published branch should do the same.

## Current state

- `apps/web/src/lib/story-queries.ts` — `getStory` / `queryStories`.
- `apps/web/src/lib/story-markdown.ts` — `lookupStoryForMarkdown` already treats `candidates.length > 1` as `ambiguous_prefix`. Do not edit it.
- `apps/web/src/routes/api/story.$id.ts` calls `getStory`. Do not edit it; the fix is inside `getStory`.
- `apps/web/src/lib/story-queries.test.ts` — `makeDb` returns every row you pass for the items query. A test that passes two rows will see both once `getStory` requests two.

```ts
// apps/web/src/lib/story-queries.ts:149-162
  // The Markdown contract needs at most two rows to detect a prefix
  // collision. The number is clamped before interpolation, never user input.
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 2);
  const itemSql = `SELECT i.id, i.url, i.title, t.title AS title_vi, i.summary,
              t.summary AS summary_vi, i.category, i.published_at,
              i.points, i.comments, i.rank_score, i.source_id, i.tags
              ${hasLlmTokens ? ", COALESCE(i.llm_tokens, 0) AS llm_tokens" : ""}
              ${hasImageUrl ? ", i.image_url" : ""}
              ${hasMediaManifest ? ", i.media_manifest" : ""}
              ${hasVotes ? `, ${VOTE_NET_COLUMN}` : ""}
       FROM items i
       ${hasVotes ? VOTE_NET_JOIN_I : ""}
       LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE substr(i.id, 1, ?) = ? AND i.status = 'published' LIMIT ${limit}`;
```

```ts
// apps/web/src/lib/story-queries.ts:259-264
export async function getStory(
  db: DbReader,
  idPrefix: string
): Promise<FeedItem | null> {
  const story = (await queryStories(db, idPrefix, 1))[0];
  if (story) return attachContentLog(db, story);
```

The merged lookup just below already returns null when `results.length !== 1`.

Conventions: the test file's `makeDb` is the pattern. Keep the SQL limit clamp. Do not switch the predicate to `LIKE`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run src/lib/story-queries.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/src/lib/story-queries.ts apps/web/src/lib/story-queries.test.ts` | exit 0 |

Do not run the full `@aidr/web` test suite or `check-types`.

## Scope

**In scope**:
- `apps/web/src/lib/story-queries.ts`
- `apps/web/src/lib/story-queries.test.ts`

**Out of scope**:
- `story-markdown.ts`, `story.$id.ts`, `story-fn.ts`.

## Git workflow

- Branch: `advisor/007-ambiguous-story-prefix`
- Commit: `fix(web): refuse an ambiguous story id prefix`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Return null when two published rows match

Change `getStory` so it calls `queryStories(db, idPrefix, 2)`. If that array's length is not 1, return null (do not attach a content log, do not fall through to the merged lookup). If length is 1, keep the existing `attachContentLog` path. Leave the merged `LIMIT 2` check as it is for the zero-published case.

**Verify**: `pnpm exec biome lint apps/web/src/lib/story-queries.ts` → exit 0

### Step 2: Test the collision

In `story-queries.test.ts`, add a case with two published rows whose ids share the prefix passed to `getStory`. Expect `null`. Keep the existing single-row cases green. The `makeDb` helper returns all provided rows for the items SELECT, so two rows are enough; you do not need a real D1.

**Verify**: `pnpm --filter @aidr/web exec vitest run src/lib/story-queries.test.ts` → all pass, including the new case.

## Test plan

The new test must call `getStory`. A single matching row still returns that story (already covered). Two rows with the same prefix return null.

## Done criteria

- [ ] `getStory` uses a limit of 2 and returns null unless exactly one published row matches
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the two files exits 0
- [ ] No files outside the in-scope list are modified

## STOP conditions

- The `getStory` excerpt does not match the file.
- Existing single-row tests fail for a reason other than the mock ignoring LIMIT (fix the assertion or the mock only if the excerpt still matches).
- The change requires editing the Markdown lookup.

## Maintenance notes

A prefix that matches one published story and one merged story still returns the published story. That matches today's merged branch, which runs only when no published row matched. Reviewers should confirm a unique full id still resolves.
