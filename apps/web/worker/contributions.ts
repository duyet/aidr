import { nn } from "./d1-bind.js";

/** One field the reviewer changed for a suggestion. */
export interface AppliedChange {
  lang: "vi" | "en";
  field: "title" | "summary";
  before: string | null;
  after: string;
}

/** `applied_changes` JSON, or — for rows reviewed before free-form
 *  suggestions — one change built from the fixed field and applied_text. */
function parseChanges(row: {
  applied_changes?: string | null;
  applied_text: string | null;
  field: string | null;
  lang: string | null;
}): AppliedChange[] {
  if (row.applied_changes) {
    try {
      const parsed = JSON.parse(row.applied_changes);
      if (Array.isArray(parsed)) return parsed as AppliedChange[];
    } catch {
      // fall through to the legacy shape
    }
  }
  if (row.applied_text && (row.field === "title" || row.field === "summary")) {
    return [
      {
        lang: row.lang === "en" ? "en" : "vi",
        field: row.field,
        before: null,
        after: row.applied_text,
      },
    ];
  }
  return [];
}

/** One row of a reader's own contribution history: an edit suggestion or a
 *  story submission. Owner-only — every query here is keyed by `userId`
 *  taken from the verified Clerk session, never from client input. */
export interface Contribution {
  kind: "suggestion" | "submission";
  id: string;
  item_id: string | null;
  /** Story title for a suggestion; the submitted title for a submission. */
  item_title: string | null;
  /** Submitted url (submissions only). */
  url: string | null;
  /** `auto` for a free-form suggestion; null for a submission. */
  field: "title" | "summary" | "auto" | null;
  lang: "vi" | "en" | null;
  /** What the reader wrote. */
  text: string;
  /** First applied field's text (kept for older clients). */
  applied_text: string | null;
  /** Every field the reviewer changed; empty unless applied. */
  applied_changes: AppliedChange[];
  rating: number | null;
  review_note: string | null;
  status: string;
  created_at: number;
  reviewed_at: number | null;
}

type ContributionRow = Omit<Contribution, "applied_changes"> & {
  applied_changes: string | null;
};

export interface ContributionCursor {
  created_at: number;
  id: string;
}

export interface ContributionPage {
  items: Contribution[];
  next: ContributionCursor | null;
}

export const CONTRIBUTIONS_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** Newest first across both tables. Keyset paging on (created_at, id) so a
 *  "load more" never skips or repeats a row when new ones arrive. */
export async function listContributions(
  db: D1Database,
  userId: string,
  options: { before?: ContributionCursor | null; limit?: number } = {}
): Promise<ContributionPage> {
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? CONTRIBUTIONS_PAGE_SIZE), 1),
    MAX_PAGE_SIZE
  );
  const before = options.before ?? null;
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT 'suggestion' AS kind, s.id, s.item_id, i.title AS item_title,
                NULL AS url, s.field, s.lang, s.suggestion AS text,
                s.applied_text, s.applied_changes, s.rating, s.review_note, s.status,
                s.created_at, s.reviewed_at
         FROM translation_suggestions s
         LEFT JOIN items i ON i.id = s.item_id
         WHERE s.user_id = ?
         UNION ALL
         SELECT 'submission' AS kind, id, item_id, title AS item_title,
                url, NULL AS field, NULL AS lang, COALESCE(note, title) AS text,
                NULL AS applied_text, NULL AS applied_changes, rating, review_note, status,
                created_at, NULL AS reviewed_at
         FROM submissions
         WHERE user_id = ?
       )
       WHERE ? IS NULL OR created_at < ? OR (created_at = ? AND id < ?)
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(
      nn(userId),
      nn(userId),
      nn(before?.created_at ?? null),
      nn(before?.created_at ?? null),
      nn(before?.created_at ?? null),
      nn(before?.id ?? null),
      limit + 1
    )
    .all<ContributionRow>();
  const rows = (results ?? []).map(
    ({ applied_changes, ...row }): Contribution => ({
      ...row,
      applied_changes:
        row.kind === "suggestion"
          ? parseChanges({ ...row, applied_changes })
          : [],
    })
  );
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next:
      rows.length > limit && last
        ? { created_at: last.created_at, id: last.id }
        : null,
  };
}

export interface SuggestionStatusView {
  id: string;
  status: string;
  field: "title" | "summary" | "auto";
  lang: "vi" | "en";
  suggestion: string;
  applied_text: string | null;
  applied_changes: AppliedChange[];
  rating: number | null;
  review_note: string | null;
  reviewed_at: number | null;
}

/** The verdict of one of the reader's own suggestions, or null when the id
 *  is not theirs. Callers read the primary DB, not a replica, so a verdict
 *  that just landed is not reported as still pending. */
export async function getOwnSuggestion(
  db: D1Database,
  userId: string,
  id: string
): Promise<SuggestionStatusView | null> {
  const row = await db
    .prepare(
      `SELECT id, status, field, COALESCE(lang, 'vi') AS lang, suggestion,
              applied_text, applied_changes, rating, review_note, reviewed_at
       FROM translation_suggestions
       WHERE id = ? AND user_id = ?`
    )
    .bind(nn(id), nn(userId))
    .first<
      Omit<SuggestionStatusView, "applied_changes"> & {
        applied_changes: string | null;
      }
    >();
  if (!row) return null;
  return { ...row, applied_changes: parseChanges(row) };
}
