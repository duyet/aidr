import { nn } from "./d1-bind.js";

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
  field: "title" | "summary" | null;
  lang: "vi" | "en" | null;
  /** What the reader wrote. */
  text: string;
  /** What the reviewer published, when it was applied. */
  applied_text: string | null;
  rating: number | null;
  review_note: string | null;
  status: string;
  created_at: number;
  reviewed_at: number | null;
}

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
                s.applied_text, s.rating, s.review_note, s.status,
                s.created_at, s.reviewed_at
         FROM translation_suggestions s
         LEFT JOIN items i ON i.id = s.item_id
         WHERE s.user_id = ?
         UNION ALL
         SELECT 'submission' AS kind, id, item_id, title AS item_title,
                url, NULL AS field, NULL AS lang, COALESCE(note, title) AS text,
                NULL AS applied_text, rating, review_note, status,
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
    .all<Contribution>();
  const rows = results ?? [];
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
  field: "title" | "summary";
  lang: "vi" | "en";
  suggestion: string;
  applied_text: string | null;
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
  return db
    .prepare(
      `SELECT id, status, field, COALESCE(lang, 'vi') AS lang, suggestion,
              applied_text, rating, review_note, reviewed_at
       FROM translation_suggestions
       WHERE id = ? AND user_id = ?`
    )
    .bind(nn(id), nn(userId))
    .first<SuggestionStatusView>();
}
