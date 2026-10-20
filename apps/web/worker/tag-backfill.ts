/**
 * Re-tags published stories stored with `tags = '[]'` before ingest applied
 * `fallbackTags` (#770, and the canonicals an unmerge left untagged, #758).
 * The plan reads with SELECTs only and calls no model. The apply writes
 * only `tags`, through the unmerge's guarded batch: one `unmerge.row`
 * audit row per story under one batch id, so `unmerge --undo <batchId>`
 * puts `[]` back. A rerun finds only the stories still untagged.
 */
import { RANK_RECOMPUTE_WINDOW_SEC } from "./ingest/context.js";
import {
  fallbackTags,
  KNOWN_TOPICS_SQL,
  type KnownTopics,
  knownTopicsFromRows,
} from "./tag-fallback.js";
import {
  applyChangeSets,
  type BatchResult,
  changeSetStatements,
} from "./unmerge/apply.js";
import type { SelectRows } from "./unmerge/load.js";
import {
  type ChangeSet,
  type ItemId,
  parseItemId,
  ROW_STATE_COLUMNS,
  type RowState,
} from "./unmerge/plan.js";

export const UNTAGGED_STORIES_SQL = `SELECT id, title, source_id, published_at, ${ROW_STATE_COLUMNS.join(", ")}
  FROM items WHERE status = 'published' AND tags = '[]'
  ORDER BY published_at`;

export interface UntaggedStory {
  id: ItemId;
  sourceId: string;
  title: string;
  publishedAt: number;
}

export interface TagBackfillPlan {
  /** Also the apply's batch id (`admin_audit.ts`). */
  nowMs: number;
  /** Stories the fallback tags, with the tags written and the state the
   * write is guarded on. */
  tag: (UntaggedStory & { tags: string[]; guard: RowState })[];
  /** Stories the fallback names nothing for. They stay `[]`. */
  noMatch: UntaggedStory[];
  /** Stories inside the re-rank window. Every ingest rewrites their
   * `rank_score`, which would turn an undo into a conflict, so they wait
   * for a rerun once they are older than `RANK_RECOMPUTE_WINDOW_SEC`. */
  recent: UntaggedStory[];
}

export async function loadTagBackfill(select: SelectRows): Promise<{
  rows: Record<string, unknown>[];
  known: KnownTopics;
}> {
  const rows = await select(UNTAGGED_STORIES_SQL);
  const known = knownTopicsFromRows(await select(KNOWN_TOPICS_SQL));
  return { rows, known };
}

export function planTagBackfill(
  rows: readonly Record<string, unknown>[],
  known: KnownTopics,
  nowMs: number
): TagBackfillPlan {
  const plan: TagBackfillPlan = { nowMs, tag: [], noMatch: [], recent: [] };
  const settledBefore = Math.floor(nowMs / 1000) - RANK_RECOMPUTE_WINDOW_SEC;
  for (const row of rows) {
    const id = parseItemId(row.id);
    if (!id) continue;
    const story: UntaggedStory = {
      id,
      sourceId: String(row.source_id),
      title: String(row.title),
      publishedAt: Number(row.published_at),
    };
    if (story.publishedAt >= settledBefore) {
      plan.recent.push(story);
      continue;
    }
    const tags = fallbackTags(story, known);
    if (tags.length === 0) {
      plan.noMatch.push(story);
      continue;
    }
    const guard = Object.fromEntries(
      ROW_STATE_COLUMNS.map((column) => [column, row[column] ?? null])
    ) as RowState;
    plan.tag.push({ ...story, tags, guard });
  }
  return plan;
}

function tagChangeSet(story: TagBackfillPlan["tag"][number]): ChangeSet {
  return {
    canonicalId: story.id,
    rows: [
      {
        id: story.id,
        role: "canonical",
        guard: story.guard,
        changes: [
          {
            column: "tags",
            before: story.guard.tags,
            after: JSON.stringify(story.tags),
          },
        ],
      },
    ],
    sources: [],
    translations: [],
  };
}

/** One guarded batch per story, all under batch id `plan.nowMs`. A story
 * whose row changed since the plan read it is listed in `stale`. */
export function applyTagBackfill(
  db: D1Database,
  plan: TagBackfillPlan
): Promise<BatchResult> {
  return applyChangeSets(
    db,
    plan.tag.map((story) => ({
      canonicalId: story.id,
      statements: changeSetStatements(
        db,
        tagChangeSet(story),
        plan.nowMs,
        "unmerge",
        { tagBackfill: story.tags }
      ),
    })),
    plan.nowMs
  );
}
