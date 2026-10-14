/**
 * Re-tags the canonicals one unmerge apply left with no tags (#758),
 * through the unmerge's guarded batch under a batch id of its own, so
 * `unmerge --undo` reverses it.
 */
import { parseTagsJson } from "../ingest/write-plan.js";
import {
  applyChangeSets,
  type BatchResult,
  changeSetStatements,
  type TargetAudit,
  UNMERGE_AUDIT_ROW,
} from "./apply.js";
import type { SelectRows } from "./load.js";
import {
  type ChangeSet,
  type ItemId,
  parseItemId,
  ROW_STATE_COLUMNS,
  type RowState,
} from "./plan.js";

export interface RetagCandidate {
  id: ItemId;
  title: string;
  summary: string | null;
  sourceId: string;
  guard: RowState;
}

export interface RetagPlan {
  unmergeBatchId: number;
  candidates: RetagCandidate[];
  skipped: { id: ItemId; reason: "tagged" | "not-published" | "missing" }[];
}

export type Tagger = (
  candidates: readonly RetagCandidate[]
) => Promise<ReadonlyMap<string, readonly string[]>>;

export interface RetagResult extends BatchResult {
  stillUntagged: ItemId[];
}

export function retagAuditSql(batchId: number): string {
  return `SELECT detail FROM admin_audit
  WHERE ts = ${batchId} AND action = '${UNMERGE_AUDIT_ROW}'
  ORDER BY id`;
}

function retagItemsSql(ids: readonly ItemId[]): string {
  return `SELECT id, title, summary, source_id, ${ROW_STATE_COLUMNS.join(", ")}
  FROM items WHERE id IN (${ids.map((id) => `'${id}'`).join(", ")})`;
}

export async function loadRetag(
  select: SelectRows,
  batchId: number
): Promise<{
  records: TargetAudit[];
  items: Map<string, Record<string, unknown>>;
}> {
  const records = (await select(retagAuditSql(batchId))).map(
    (row) => JSON.parse(String(row.detail)) as TargetAudit
  );
  const ids = [
    ...new Set(
      records.map((r) =>
        r.kind === "row" && r.target.role === "canonical"
          ? parseItemId(r.target.id)
          : null
      )
    ),
  ].filter((id): id is ItemId => id !== null);
  const items = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 100) {
    for (const row of await select(retagItemsSql(ids.slice(i, i + 100)))) {
      items.set(String(row.id), row);
    }
  }
  return { records, items };
}

export function planRetag(
  unmergeBatchId: number,
  records: readonly TargetAudit[],
  items: ReadonlyMap<string, Record<string, unknown>>
): RetagPlan {
  const plan: RetagPlan = { unmergeBatchId, candidates: [], skipped: [] };
  const seen = new Set<string>();
  for (const record of records) {
    if (record.kind !== "row" || record.target.role !== "canonical") continue;
    const id = record.target.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const row = items.get(id);
    if (!row) plan.skipped.push({ id, reason: "missing" });
    else if (row.status !== "published")
      plan.skipped.push({ id, reason: "not-published" });
    else if (parseTagsJson(row.tags as string | null).length > 0)
      plan.skipped.push({ id, reason: "tagged" });
    else {
      plan.candidates.push({
        id,
        title: String(row.title),
        summary: (row.summary as string | null) ?? null,
        sourceId: String(row.source_id),
        guard: Object.fromEntries(
          ROW_STATE_COLUMNS.map((column) => [column, row[column] ?? null])
        ) as RowState,
      });
    }
  }
  return plan;
}

export function retagChangeSets(
  plan: RetagPlan,
  tags: ReadonlyMap<string, readonly string[]>
): ChangeSet[] {
  return plan.candidates.flatMap((candidate) => {
    const after = tags.get(candidate.id) ?? [];
    if (after.length === 0) return [];
    return [
      {
        canonicalId: candidate.id,
        rows: [
          {
            id: candidate.id,
            role: "canonical" as const,
            guard: candidate.guard,
            changes: [
              {
                column: "tags",
                before: candidate.guard.tags,
                after: JSON.stringify(after),
              },
            ],
          },
        ],
        sources: [],
        translations: [],
      },
    ];
  });
}

export async function applyRetag(
  db: D1Database,
  plan: RetagPlan,
  tag: Tagger,
  batchId: number
): Promise<RetagResult> {
  const sets =
    plan.candidates.length === 0
      ? []
      : retagChangeSets(plan, await tag(plan.candidates));
  const tagged = new Set<string>(sets.map((set) => set.canonicalId));
  const result = await applyChangeSets(
    db,
    sets.map((set) => ({
      canonicalId: set.canonicalId,
      statements: changeSetStatements(db, set, batchId, "unmerge", {
        retagOf: plan.unmergeBatchId,
      }),
    })),
    batchId
  );
  return {
    ...result,
    stillUntagged: plan.candidates
      .filter((c) => !tagged.has(c.id))
      .map((c) => c.id),
  };
}
