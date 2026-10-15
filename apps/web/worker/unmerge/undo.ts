/**
 * Reverses one unmerge apply from its `admin_audit` rows. Every target the
 * apply wrote has a `unmerge.row` / `.sources` / `.translation` row holding
 * its before and after (`TargetAudit`), all with `ts` = the batch id. Undo
 * writes the befores back through the same guarded batch, so it applies
 * only while each target still holds what the apply wrote.
 */
import {
  type AuditPrefix,
  applyChangeSets,
  type BatchResult,
  changeSetStatements,
  type TargetAudit,
  UNMERGE_AUDIT_ROW,
  UNMERGE_AUDIT_SOURCES,
  UNMERGE_AUDIT_TRANSLATION,
} from "./apply.js";
import { type SelectRows, unmergeSourcesSql } from "./load.js";
import {
  type ChangeSet,
  type ItemId,
  parseItemId,
  ROW_STATE_COLUMNS,
  type RowState,
  type RowTarget,
  type StoredSource,
  type TranslationText,
} from "./plan.js";

const UNDO_PREFIX: AuditPrefix = "unmerge.undo";

export function parseBatchId(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** An undo's `canonicalIds`: absent undoes the whole batch; otherwise a
 * non-empty list of full ids. A short id is refused, never matched as a
 * prefix. */
export function parseUndoCanonicalIds(
  value: unknown
): { canonicalIds: ItemId[] | null } | { error: string } {
  if (value === undefined) return { canonicalIds: null };
  const ids = Array.isArray(value) ? value.map(parseItemId) : [];
  if (ids.length === 0 || ids.some((id) => id === null)) {
    return {
      error: "canonicalIds must be a non-empty array of 64-char hex item ids",
    };
  }
  return { canonicalIds: [...new Set(ids as ItemId[])] };
}

/** The batch's records for `canonicalIds` (all of them for null). An id the
 * batch did not write is an error, so a typo cannot fall back to the whole
 * batch. */
export function scopeUndoRecords(
  records: readonly TargetAudit[],
  canonicalIds: readonly ItemId[] | null
): { records: TargetAudit[] } | { error: string } {
  if (canonicalIds === null) return { records: [...records] };
  const scope = new Set<string>(canonicalIds);
  const written = new Set<string>(records.map((r) => r.canonicalId));
  const unknown = canonicalIds.filter((id) => !written.has(id));
  if (unknown.length > 0) {
    return {
      error: `the batch wrote no canonical ${unknown.join(", ")}`,
    };
  }
  return { records: records.filter((r) => scope.has(r.canonicalId)) };
}

export function undoAuditSql(batchId: number): string {
  return `SELECT id, detail FROM admin_audit
  WHERE ts = ${batchId}
    AND action IN ('${UNMERGE_AUDIT_ROW}', '${UNMERGE_AUDIT_SOURCES}', '${UNMERGE_AUDIT_TRANSLATION}')
  ORDER BY id`;
}

/** What the touched targets hold now. */
export interface UndoState {
  items: ReadonlyMap<string, Record<string, unknown>>;
  sources: ReadonlyMap<string, readonly StoredSource[]>;
  translations: ReadonlyMap<string, TranslationText>;
}

export interface UndoCanonical {
  canonicalId: ItemId;
  /** `undo`: every target still holds what the apply wrote. `noop`: every
   * target already holds its pre-apply value. `conflict`: anything else;
   * nothing is written. */
  state: "undo" | "noop" | "conflict";
  conflicts: string[];
  /** The inverse of the apply's change set. */
  changes: ChangeSet;
}

export interface UndoPlan {
  batchId: number;
  canonicals: UndoCanonical[];
}

/** The row's state with its changes' `side` applied. */
function stateWith(row: RowTarget, side: "before" | "after"): RowState {
  return {
    ...row.guard,
    ...Object.fromEntries(row.changes.map((c) => [c.column, c[side]])),
  };
}

function inverseRow(row: RowTarget): RowTarget {
  return {
    ...row,
    guard: stateWith(row, "after"),
    changes: row.changes.map(({ column, before, after }) => ({
      column,
      before: after,
      after: before,
    })),
  };
}

/** Groups the apply's target rows by canonical and inverts each. */
export function inverseChangeSets(
  records: readonly TargetAudit[]
): ChangeSet[] {
  const sets = new Map<string, ChangeSet>();
  for (const record of records) {
    const set = sets.get(record.canonicalId) ?? {
      canonicalId: record.canonicalId,
      rows: [],
      sources: [],
      translations: [],
    };
    sets.set(record.canonicalId, set);
    if (record.kind === "row") set.rows.push(inverseRow(record.target));
    if (record.kind === "sources") {
      const { itemId, before, after } = record.target;
      set.sources.push({ itemId, before: after, after: before });
    }
    if (record.kind === "translation") {
      const { itemId, before, after } = record.target;
      set.translations.push({ itemId, before: after, after: before });
    }
  }
  return [...sets.values()];
}

const sourcesKey = (rows: readonly StoredSource[]) =>
  JSON.stringify(
    rows.map((r) => [r.kind, r.author, r.posted_at, r.quote, r.url])
  );

const translationKey = (text: TranslationText | null | undefined) =>
  text ? JSON.stringify([text.title, text.summary]) : "none";

/** Whether each target of `set` holds what the apply wrote (`set`'s
 * `before`) and whether it holds its pre-apply value (`after`). A target
 * the apply only guarded, such as a live twin that gained merged rows,
 * holds both. */
function targetStates(
  set: ChangeSet,
  state: UndoState
): { label: string; applied: boolean; pre: boolean }[] {
  return [
    ...set.rows.map((row) => {
      const current = state.items.get(row.id);
      const holds = (expected: RowState) =>
        current !== undefined &&
        ROW_STATE_COLUMNS.every(
          (column) => (current[column] ?? null) === (expected[column] ?? null)
        );
      return {
        label: `items ${row.id.slice(0, 8)}`,
        applied: holds(row.guard),
        pre: holds(stateWith(row, "after")),
      };
    }),
    ...set.sources.map((target) => {
      const current = sourcesKey(state.sources.get(target.itemId) ?? []);
      return {
        label: `item_sources ${target.itemId.slice(0, 8)}`,
        applied: current === sourcesKey(target.before),
        pre: current === sourcesKey(target.after),
      };
    }),
    ...set.translations.map((target) => {
      const current = translationKey(state.translations.get(target.itemId));
      return {
        label: `translations ${target.itemId.slice(0, 8)}`,
        applied: current === translationKey(target.before),
        pre: current === translationKey(target.after),
      };
    }),
  ];
}

export function planUndo(
  batchId: number,
  records: readonly TargetAudit[],
  state: UndoState
): UndoPlan {
  return {
    batchId,
    canonicals: inverseChangeSets(records).map((changes) => {
      const states = targetStates(changes, state);
      return {
        canonicalId: changes.canonicalId,
        state: states.every((s) => s.applied)
          ? "undo"
          : states.every((s) => s.pre)
            ? "noop"
            : "conflict",
        conflicts: states
          .filter((s) => !s.applied)
          .map(
            (s) =>
              `${s.label} holds ${s.pre ? "its pre-apply value" : "neither value"}`
          ),
        changes,
      };
    }),
  };
}

function idList(ids: readonly string[]): string {
  return ids.map((id) => `'${parseItemId(id) ?? ""}'`).join(", ");
}

/** The batch's audit records and the current state of every target. */
export async function loadUndo(
  select: SelectRows,
  batchId: number
): Promise<{ records: TargetAudit[]; state: UndoState }> {
  const records = (await select(undoAuditSql(batchId))).map(
    (row) => JSON.parse(String(row.detail)) as TargetAudit
  );
  const ids = [
    ...new Set(
      records.map((r) => (r.kind === "row" ? r.target.id : r.target.itemId))
    ),
  ];
  const items = new Map<string, Record<string, unknown>>();
  const sources = new Map<string, StoredSource[]>();
  const translations = new Map<string, TranslationText>();
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    for (const row of await select(
      `SELECT id, ${ROW_STATE_COLUMNS.join(", ")} FROM items WHERE id IN (${idList(part)})`
    )) {
      items.set(String(row.id), row);
    }
    for (const row of await select(unmergeSourcesSql(part as ItemId[]))) {
      const list = sources.get(String(row.item_id)) ?? [];
      list.push({
        kind: row.kind as StoredSource["kind"],
        author: (row.author as string | null) ?? null,
        posted_at: (row.posted_at as number | null) ?? null,
        quote: (row.quote as string | null) ?? null,
        url: (row.url as string | null) ?? null,
      });
      sources.set(String(row.item_id), list);
    }
    for (const row of await select(
      `SELECT item_id, title, summary FROM translations WHERE lang = 'vi' AND item_id IN (${idList(part)})`
    )) {
      translations.set(String(row.item_id), {
        title: (row.title as string | null) ?? null,
        summary: (row.summary as string | null) ?? null,
      });
    }
  }
  return { records, state: { items, sources, translations } };
}

/** Writes the canonicals in state `undo`, each in one guarded batch. */
export function applyUndo(
  db: D1Database,
  plan: UndoPlan,
  nowMs: number
): Promise<BatchResult> {
  return applyChangeSets(
    db,
    plan.canonicals
      .filter((c) => c.state === "undo")
      .map((c) => ({
        canonicalId: c.canonicalId,
        statements: changeSetStatements(db, c.changes, nowMs, UNDO_PREFIX, {
          undoes: plan.batchId,
        }),
      })),
    nowMs
  );
}
