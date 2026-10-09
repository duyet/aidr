# Plan 021: One URL in a single ingest run becomes one new row

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5beb7a0..HEAD -- apps/web/worker/ingest/dedupe.ts apps/web/worker/__tests__/dedupe.test.ts`
> On a mismatch with the excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5beb7a0`, 2026-10-05
- **Issue**: https://github.com/duyet/aidr/issues/417

## Why this matters

Item ids are `sha256` of the URL. `toCandidates` appends every fetched item, and `dedupeNewRows` only drops ids already stored in `items`. Two feeds that emit the same URL in one run both stay in `newRows`. Later upserts share one primary key, so the second write replaces the first source, and a merge that marks that id `merged` can mark both copies merged. The story never becomes the published canonical.

## Current state

```ts
// apps/web/worker/ingest/dedupe.ts:70-87
export async function toCandidates(
  fetchedBySource: readonly FetchedSource[]
): Promise<NewRow[]> {
  const candidates: NewRow[] = [];
  for (const { source, items } of fetchedBySource) {
    const hashed = await Promise.all(
      items.map(async (item) => ({
        id: await sha256Hex(item.url),
        source,
        item: {
          ...item,
          publishedAt: toEpochSeconds(item.publishedAt),
        },
      }))
    );
    candidates.push(...hashed);
  }
  return candidates;
}
```

```ts
// apps/web/worker/ingest/dedupe.ts:183-190
    const rows = candidates.filter((c) => !existingIds.has(c.id));
    rows.push(
      ...(await readmitOfficialRows(
        env.DB,
        candidates.filter((c) => existingIds.has(c.id)),
        sources
      ))
    );
```

`officialSourceFor` lives in `apps/web/worker/dedupe.ts`. Use it. Do not change the merge algorithm.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Targeted test | `pnpm --filter @aidr/web exec vitest run worker/__tests__/dedupe.test.ts` | exit 0 |
| Lint | `pnpm exec biome lint apps/web/worker/ingest/dedupe.ts apps/web/worker/__tests__/dedupe.test.ts` | exit 0 |

Do not run the full web suite or `check-types`. If `dedupe.test.ts` does not cover `dedupeNewRows`, add the test in `worker/__tests__/ingest-steps.test.ts` only when that file already imports `dedupeNewRows`. Prefer a pure helper tested without D1.

## Scope

**In scope**:
- `apps/web/worker/ingest/dedupe.ts`
- `apps/web/worker/__tests__/dedupe.test.ts` or the existing ingest-steps test if that is where `dedupeNewRows` is tested

**Out of scope**:
- `worker/dedupe.ts` merge rules, `write.ts`, scoring.

## Git workflow

- Branch: `advisor/021-dedupe-same-url`
- Commit: `fix(web): keep one row when two feeds share a URL`
- Trailer: `Co-Authored-By: duyetbot <bot@duyet.net>`
- Push and open one PR to `master` when the dispatcher says so. Do not merge.

## Steps

### Step 1: Collapse by id before the existing-id filter

Export a pure function `collapseSameUrl(rows: readonly NewRow[]): NewRow[]` that keeps one row per `id`. When two rows share an id, keep the one for which `officialSourceFor(row.source.id, row.item.url)` is set. If neither or both are official, keep the one with the higher `item.points`, then the higher `item.comments`, then the earlier row. Call it on `candidates` inside `dedupeNewRows` before the `existingIds` filter, so readmission also sees one row per id.

**Verify**: `pnpm exec biome lint apps/web/worker/ingest/dedupe.ts` → exit 0

### Step 2: Test the collapse

Two `NewRow` values with the same id and different `source.id`. One source is an official lab id that `officialSourceFor` recognizes (read `worker/dedupe.ts` for an id it returns a spec for, such as an OpenAI source id already used in tests). Expect that official row. A second case with two non-official rows expects the higher `points`.

**Verify**: the targeted vitest command exits 0.

## Test plan

Call `collapseSameUrl`. Do not reimplement the keeper rule inside the test.

## Done criteria

- [ ] `dedupeNewRows` collapses candidates by id before the existing-id filter
- [ ] Official wins over a non-official duplicate; otherwise higher points wins
- [ ] Targeted vitest exits 0
- [ ] Biome lint on the touched files exits 0

## STOP conditions

- `toCandidates` already drops duplicate ids. Stop.
- `officialSourceFor` is not safe to call with a source id and URL. Stop.
- The targeted test fails twice.

## Maintenance notes

Readmission still pushes a stored row that may share an id with a newly fetched row. Collapse before that push as well: if `rows` already contains the id, do not push the readmitted copy. The fetched official row is the one that just arrived.
