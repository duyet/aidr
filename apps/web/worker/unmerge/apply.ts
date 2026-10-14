/**
 * Turns a `ChangeSet` into one D1 batch. The batch opens with one guarded
 * `admin_audit` insert per write target: the insert's `action` is NULL, so
 * the NOT NULL constraint fails the whole batch, unless the target still
 * holds every value the plan read. So a stale plan writes nothing, and the
 * audit rows hold every before and after, which undo reads back.
 *
 * Writes no `notifications`, `tldr_snapshots`, digest or weekly rows:
 * restored rows sit outside every send window (`UNMERGE_QUIET_SEC`).
 */
import {
  buildItemSourceBindArgs,
  nn,
  prepareTranslationUpsert,
} from "../d1-bind.js";
import { INSERT_ITEM_SOURCE_SQL } from "../ingest/write.js";
import {
  type ChangeSet,
  type ItemId,
  MOVED_ACTIONS,
  ROW_STATE_COLUMNS,
  type RowTarget,
  type SourcesTarget,
  type TranslationTarget,
  type UnmergePlan,
} from "./plan.js";

/** `admin_audit.action` prefixes: an apply writes `unmerge.*`, an undo
 * `unmerge.undo.*`. */
export type AuditPrefix = "unmerge" | "unmerge.undo";

export const UNMERGE_AUDIT_ROW = "unmerge.row";
export const UNMERGE_AUDIT_SOURCES = "unmerge.sources";
export const UNMERGE_AUDIT_TRANSLATION = "unmerge.translation";
export const UNMERGE_AUDIT_CANONICAL = "unmerge.canonical";

/** The audit detail of one write target; `batchId` is the batch's `ts`. */
export type TargetAudit = { batchId: number; canonicalId: ItemId } & (
  | { kind: "row"; target: RowTarget }
  | { kind: "sources"; target: SourcesTarget }
  | { kind: "translation"; target: TranslationTarget }
);

const WRITABLE_COLUMNS = new Set<string>(ROW_STATE_COLUMNS);

interface Guard {
  sql: string;
  args: unknown[];
}

/** The row still holds every value the plan read. */
function rowGuard(row: RowTarget): Guard {
  const columns = Object.keys(row.guard);
  for (const column of [...columns, ...row.changes.map((c) => c.column)]) {
    if (!WRITABLE_COLUMNS.has(column))
      throw new Error(`unmerge cannot write ${column}`);
  }
  return {
    sql: `EXISTS (SELECT 1 FROM items WHERE id = ? AND ${columns
      .map((column) => `${column} IS ?`)
      .join(" AND ")})`,
    args: [row.id, ...Object.values(row.guard).map(nn)],
  };
}

/** The item's `item_sources` rows are exactly `before`, in position order. */
function sourcesGuard(target: SourcesTarget): Guard {
  const rows = JSON.stringify(
    target.before.map((r) => [r.kind, r.author, r.posted_at, r.quote, r.url])
  );
  return {
    sql: `(SELECT COUNT(*) FROM item_sources WHERE item_id = ?) = json_array_length(?)
      AND NOT EXISTS (SELECT 1 FROM json_each(?) e WHERE NOT EXISTS (
        SELECT 1 FROM item_sources s WHERE s.item_id = ? AND s.position = e.key
          AND s.kind IS json_extract(e.value, '$[0]')
          AND s.author IS json_extract(e.value, '$[1]')
          AND s.posted_at IS json_extract(e.value, '$[2]')
          AND s.quote IS json_extract(e.value, '$[3]')
          AND s.url IS json_extract(e.value, '$[4]')))`,
    args: [target.itemId, rows, rows, target.itemId],
  };
}

function translationGuard(target: TranslationTarget): Guard {
  return target.before === null
    ? {
        sql: "NOT EXISTS (SELECT 1 FROM translations WHERE item_id = ? AND lang = 'vi')",
        args: [target.itemId],
      }
    : {
        sql: "EXISTS (SELECT 1 FROM translations WHERE item_id = ? AND lang = 'vi' AND title IS ? AND summary IS ?)",
        args: [target.itemId, target.before.title, target.before.summary],
      };
}

function guardedAudit(
  db: D1Database,
  ts: number,
  action: string,
  detail: TargetAudit,
  guard: Guard
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO admin_audit (ts, action, detail) VALUES (?, (SELECT ? WHERE ${guard.sql}), ?)`
    )
    .bind(ts, action, ...guard.args, JSON.stringify(detail));
}

function rowUpdate(db: D1Database, row: RowTarget): D1PreparedStatement {
  const sets = row.changes.map(({ column }) => `${column} = ?`).join(", ");
  return db
    .prepare(`UPDATE items SET ${sets} WHERE id = ?`)
    .bind(...row.changes.map(({ after }) => nn(after)), row.id);
}

function sourcesWrite(
  db: D1Database,
  target: SourcesTarget
): D1PreparedStatement[] {
  const fetched = target.after.map((row) => ({
    kind: row.kind,
    author: row.author ?? undefined,
    postedAt: row.posted_at ?? undefined,
    quote: row.quote ?? undefined,
    url: row.url ?? undefined,
  }));
  return [
    db
      .prepare("DELETE FROM item_sources WHERE item_id = ?")
      .bind(target.itemId),
    ...buildItemSourceBindArgs(target.itemId, fetched).map((args) =>
      db.prepare(INSERT_ITEM_SOURCE_SQL).bind(...args)
    ),
  ];
}

function translationWrite(
  db: D1Database,
  target: TranslationTarget
): D1PreparedStatement {
  return target.after === null
    ? db
        .prepare("DELETE FROM translations WHERE item_id = ? AND lang = 'vi'")
        .bind(target.itemId)
    : prepareTranslationUpsert(db, {
        id: target.itemId,
        lang: "vi",
        sourceLang: "vi",
        targetLang: "vi",
        title: target.after.title,
        summary: target.after.summary,
      });
}

/** The batch for one change set: every guard first, then the writes, then
 * an unguarded summary row. Empty when the set writes nothing. */
export function changeSetStatements(
  db: D1Database,
  set: ChangeSet,
  ts: number,
  prefix: AuditPrefix,
  summary: Record<string, unknown>
): D1PreparedStatement[] {
  const changed = set.rows.filter((row) => row.changes.length > 0);
  if (changed.length + set.sources.length + set.translations.length === 0) {
    return [];
  }
  const base = { batchId: ts, canonicalId: set.canonicalId };
  // Every planned row is guarded, written or not: a live twin that gains
  // only merged rows must still be the published row the plan read.
  return [
    ...set.rows.map((target) =>
      guardedAudit(
        db,
        ts,
        `${prefix}.row`,
        { ...base, kind: "row", target },
        rowGuard(target)
      )
    ),
    ...set.sources.map((target) =>
      guardedAudit(
        db,
        ts,
        `${prefix}.sources`,
        { ...base, kind: "sources", target },
        sourcesGuard(target)
      )
    ),
    ...set.translations.map((target) =>
      guardedAudit(
        db,
        ts,
        `${prefix}.translation`,
        { ...base, kind: "translation", target },
        translationGuard(target)
      )
    ),
    ...changed.map((row) => rowUpdate(db, row)),
    ...set.sources.flatMap((target) => sourcesWrite(db, target)),
    ...set.translations.map((target) => translationWrite(db, target)),
    db
      .prepare("INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)")
      .bind(ts, `${prefix}.canonical`, JSON.stringify({ ...base, ...summary })),
  ];
}

/** Every statement in a batch counts toward D1's per-invocation query
 * limit; this leaves room for the snapshot reads under it. */
export const UNMERGE_MAX_STATEMENTS = 800;

export interface BatchResult {
  /** The `admin_audit.ts` of every row this request wrote; undo takes it. */
  batchId: number;
  canonicals: number;
  statements: number;
  /** Canonicals left for a rerun because the request hit
   * `UNMERGE_MAX_STATEMENTS`. */
  remaining: number;
  /** Canonicals whose rows changed after the plan read them: a guard failed
   * and the batch wrote nothing. A rerun re-plans them from fresh rows. */
  stale: ItemId[];
  /** Set when a batch failed for another reason. That canonical wrote
   * nothing and the request stopped there; earlier ones committed under
   * `batchId`. */
  failed?: { canonicalId: ItemId; error: string };
}

const GUARD_FAILED = "NOT NULL constraint failed: admin_audit.action";

/** One atomic batch per change set, so a failure leaves that canonical as it
 * was and a rerun picks it up again. Never throws after a batch committed,
 * so the response always carries the batch id undo needs. */
export async function applyChangeSets(
  db: D1Database,
  batches: readonly {
    canonicalId: ItemId;
    statements: D1PreparedStatement[];
  }[],
  batchId: number,
  maxStatements = UNMERGE_MAX_STATEMENTS
): Promise<BatchResult> {
  const result: BatchResult = {
    batchId,
    canonicals: 0,
    statements: 0,
    remaining: 0,
    stale: [],
  };
  for (const { canonicalId, statements } of batches) {
    if (statements.length === 0) continue;
    if (result.statements + statements.length > maxStatements) {
      result.remaining++;
      continue;
    }
    try {
      await db.batch(statements);
    } catch (error) {
      if (String(error).includes(GUARD_FAILED)) {
        result.stale.push(canonicalId);
        continue;
      }
      result.failed = { canonicalId, error: String(error) };
      return result;
    }
    result.canonicals++;
    result.statements += statements.length;
  }
  return result;
}

/** Statements for one canonical's plan; empty when nothing moves. */
export function canonicalStatements(
  db: D1Database,
  plan: UnmergePlan["canonicals"][number],
  ts: number
): D1PreparedStatement[] {
  const moved = plan.pairs.filter(({ outcome }) =>
    MOVED_ACTIONS.has(outcome.action)
  );
  if (moved.length === 0) return [];
  return changeSetStatements(db, plan, ts, "unmerge", {
    pairs: moved,
    lossy: plan.lossy,
  });
}

export function applyUnmerge(
  db: D1Database,
  plan: UnmergePlan,
  maxStatements = UNMERGE_MAX_STATEMENTS
): Promise<BatchResult> {
  return applyChangeSets(
    db,
    plan.canonicals.map((canonical) => ({
      canonicalId: canonical.canonicalId,
      statements: canonicalStatements(db, canonical, plan.nowMs),
    })),
    plan.nowMs,
    maxStatements
  );
}
