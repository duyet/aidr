/**
 * Turns an `UnmergePlan` into D1 writes, one batch per canonical, with an
 * `admin_audit` row per pair and per canonical in the same batch. Writes no
 * `notifications`, `tldr_snapshots`, digest or weekly rows: restored rows
 * sit outside every send window (`UNMERGE_QUIET_SEC`).
 */
import {
  buildItemSourceBindArgs,
  nn,
  prepareTranslationUpsert,
} from "../d1-bind.js";
import { INSERT_ITEM_SOURCE_SQL } from "../ingest/write.js";
import type { CanonicalPlan, RowTarget, UnmergePlan } from "./plan.js";

export const UNMERGE_AUDIT_PAIR = "unmerge.pair";
export const UNMERGE_AUDIT_CANONICAL = "unmerge.canonical";

const WRITABLE_COLUMNS = new Set([
  "status",
  "duplicate_of",
  "points",
  "comments",
  "tags",
  "image_url",
  "media_manifest",
  "rank_score",
]);

function rowUpdate(db: D1Database, row: RowTarget): D1PreparedStatement {
  for (const { column } of row.changes) {
    if (!WRITABLE_COLUMNS.has(column))
      throw new Error(`unmerge cannot write ${column}`);
  }
  const sets = row.changes.map(({ column }) => `${column} = ?`).join(", ");
  return db
    .prepare(
      `UPDATE items SET ${sets} WHERE id = ? AND status = ? AND duplicate_of IS ?`
    )
    .bind(
      ...row.changes.map(({ after }) => nn(after)),
      row.id,
      row.guard.status,
      row.guard.duplicateOf
    );
}

function audit(db: D1Database, ts: number, action: string, detail: unknown) {
  return db
    .prepare("INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)")
    .bind(ts, action, JSON.stringify(detail));
}

/** Statements for one canonical; empty when nothing is restored. */
export function canonicalStatements(
  db: D1Database,
  plan: CanonicalPlan,
  ts: number
): D1PreparedStatement[] {
  const moved = plan.pairs.filter(
    ({ outcome }) =>
      outcome.action === "restore" || outcome.action === "regroup"
  );
  if (moved.length === 0) return [];
  const statements: D1PreparedStatement[] = [];
  for (const row of plan.rows) {
    if (row.changes.length > 0) statements.push(rowUpdate(db, row));
  }
  for (const target of plan.sources) {
    statements.push(
      db
        .prepare("DELETE FROM item_sources WHERE item_id = ?")
        .bind(target.itemId)
    );
    const fetched = target.after.map((row) => ({
      kind: row.kind,
      author: row.author ?? undefined,
      postedAt: row.posted_at ?? undefined,
      quote: row.quote ?? undefined,
      url: row.url ?? undefined,
    }));
    for (const args of buildItemSourceBindArgs(target.itemId, fetched)) {
      statements.push(db.prepare(INSERT_ITEM_SOURCE_SQL).bind(...args));
    }
  }
  for (const vi of plan.viTranslations) {
    statements.push(
      prepareTranslationUpsert(db, {
        id: vi.itemId,
        lang: "vi",
        sourceLang: "vi",
        targetLang: "vi",
        title: vi.title,
        summary: vi.summary,
      })
    );
  }
  const rowById = new Map(plan.rows.map((row) => [row.id as string, row]));
  for (const { pair, outcome } of moved) {
    statements.push(
      audit(db, ts, UNMERGE_AUDIT_PAIR, {
        canonicalId: pair.canonicalId,
        mergedId: pair.mergedId,
        group: pair.group,
        outcome,
        changes: rowById.get(pair.mergedId)?.changes ?? [],
      })
    );
  }
  statements.push(
    audit(db, ts, UNMERGE_AUDIT_CANONICAL, {
      canonicalId: plan.canonicalId,
      mergedIds: moved.map(({ pair }) => pair.mergedId),
      changes: rowById.get(plan.canonicalId)?.changes ?? [],
      sources: plan.sources.find((s) => s.itemId === plan.canonicalId) ?? null,
      lossy: plan.lossy,
    })
  );
  return statements;
}

export interface UnmergeApplyResult {
  canonicals: number;
  statements: number;
}

/** One atomic batch per canonical, so a failure leaves that canonical as it
 * was and a rerun picks it up again. */
export async function applyUnmerge(
  db: D1Database,
  plan: UnmergePlan
): Promise<UnmergeApplyResult> {
  let canonicals = 0;
  let statements = 0;
  for (const canonical of plan.canonicals) {
    const batch = canonicalStatements(db, canonical, plan.nowMs);
    if (batch.length === 0) continue;
    await db.batch(batch);
    canonicals++;
    statements += batch.length;
  }
  return { canonicals, statements };
}
