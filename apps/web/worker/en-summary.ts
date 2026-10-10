/**
 * LLM-written English summaries for English-source stories.
 *
 * `items.summary` is the upstream text as fetched (RSS teaser, og:description,
 * page chrome). Dedupe, scoring, translation and QA read it raw, so it is never
 * overwritten. The reader-facing English summary lives beside it in
 * `items.summary_en`, written from the same stripped, clipped source the
 * Vietnamese translation sees (`sentSource`), so both languages state the same
 * facts. `summary_en_revision` records the `items.source_revision` it was
 * written from: the 0023 trigger bumps that revision on any title/summary
 * change, which makes a stale rewrite invisible and puts the row back in the
 * backfill queue.
 *
 * English only. The Vietnamese column never reads `summary_en`
 * (worker/digest/edition.ts: language columns do not fall back to each other).
 */

/** Rows per run. The step runs every 30 minutes and covers fresh items too
 * (it runs after `write`), so 24 drains ~1,100 rows a day. */
export const BACKFILL_EN_SUMMARY_CAP = 24;
/** Stories per LLM call. */
export const EN_SUMMARY_BATCH_SIZE = 4;
/** Hard ceiling on a generated summary. 2–4 sentences fit well under this. */
export const EN_SUMMARY_MAX_CHARS = 700;

/**
 * Display expression for the English summary: the LLM rewrite when it was
 * written from the current source revision, else the raw upstream summary.
 * Use only in reader-facing SELECTs, never as pipeline input.
 */
export function enSummarySql(alias = "i"): string {
  return `CASE WHEN ${alias}.summary_en IS NOT NULL AND ${alias}.summary_en != ''
              AND ${alias}.summary_en_revision = ${alias}.source_revision
            THEN ${alias}.summary_en ELSE ${alias}.summary END`;
}

/**
 * English-source published items with a summary but no current LLM English
 * summary, newest first. The teaser rows (`[…]`, "Read more") are a subset:
 * once backfill-content replaces a teaser, the revision bump re-queues it.
 */
export function buildMissingEnSummaryQuery(
  limit = BACKFILL_EN_SUMMARY_CAP
): string {
  return `SELECT id, title, summary, source_revision FROM items
          WHERE status = 'published'
            AND source_lang = 'en'
            AND summary IS NOT NULL AND TRIM(summary) != ''
            AND (summary_en IS NULL OR summary_en = ''
                 OR summary_en_revision IS NOT source_revision)
          ORDER BY published_at DESC
          LIMIT ${limit}`;
}

/** Written only when the row still has the revision the summary came from,
 * so a re-ingest that landed mid-call cannot get a stale rewrite. */
export const EN_SUMMARY_UPDATE_SQL = `UPDATE items
  SET summary_en = ?, summary_en_revision = ?
  WHERE id = ? AND source_revision = ?`;

const TEASER_PATTERNS: readonly RegExp[] = [
  /\[\s*(?:…|\.\.\.)\s*\]/,
  /(?:…|\.\.\.)\s*$/,
  /\bread more\b/i,
  /\bcontinue reading\b/i,
  /\bclick here\b/i,
  /\bsubscribe\b/i,
  /\bsign up\b/i,
  /https?:\/\//i,
  /\bwww\./i,
  /\b\d+\s+(?:comments?|points?|upvotes?|views?|likes?|shares?)\b/i,
];

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

function numbers(text: string): Set<string> {
  return new Set((text.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, "")));
}

/**
 * Deterministic reasons to reject a generated summary. Any issue keeps the
 * raw fallback on screen; the row is retried on a later run.
 */
export function enSummaryIssues(source: string, output: string): string[] {
  const text = output.trim();
  const issues: string[] = [];
  if (!text) return ["empty"];
  if (text.length > EN_SUMMARY_MAX_CHARS) issues.push("too long");
  for (const pattern of TEASER_PATTERNS) {
    if (pattern.test(text)) {
      issues.push(`chrome or teaser: ${pattern.source}`);
      break;
    }
  }
  const sourceNumbers = numbers(source);
  for (const n of numbers(text)) {
    if (!sourceNumbers.has(n)) {
      issues.push(`number not in source: ${n}`);
      break;
    }
  }
  if (!/[.!?]["')\]]?$/.test(text)) issues.push("unfinished sentence");
  return issues;
}

export interface EnSummaryInput {
  i: number;
  title: string;
  /** Already stripped and clipped (`sentSource`). */
  summary: string;
}

export function enSummaryPrompt(batch: readonly EnSummaryInput[]): string {
  return `Write the English summary readers see for each AI/tech news item below.

Rules:
- Fluent, neutral English. 2–4 sentences is a ceiling, not a target: a source with one fact gets one sentence.
- Use only facts in the item's title and text. Add nothing, guess nothing.
- Keep names, product names, numbers, dates, and hedges ("may", "reportedly") exactly as written.
- No hype or marketing words ("revolutionary", "game-changing", "exciting").
- Leave out site navigation, bylines, counters (points, comments, views), UI text, "[…]", "Read more", "Continue reading", links, and calls to subscribe.
- Every sentence ends with a full stop. Never end with an ellipsis.
- Do not start with "This article" or "The post"; state the news.
- If the text has no usable facts beyond the title, write one sentence from the title.

Items:
${JSON.stringify(batch.map(({ i, title, summary }) => ({ i, title, text: summary })))}

Respond with strict JSON only: {"results":[{"i":0,"summary":"..."}]}`;
}

export interface EnSummaryResult {
  i: number;
  summary: string;
}

/** Rows from any shape models have returned: a bare array, or an object
 * under `results` / `summaries` / `items` (the translate path has seen
 * Gemini rename the key, logged as invalid_response). */
function resultRows(raw: unknown): unknown[] | undefined {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  for (const key of ["results", "summaries", "items"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return undefined;
}

/** Keep only requested indexes, once each, with a summary that passes
 * `enSummaryIssues` against its own source. Rows without `i` are matched by
 * position only when the array lines up with the batch. */
export function sanitizeEnSummaryResults(
  raw: unknown,
  batch: readonly EnSummaryInput[]
): EnSummaryResult[] {
  const rows = resultRows(raw);
  if (!rows) return [];
  const byIndex = new Map(batch.map((item) => [item.i, item]));
  const seen = new Set<number>();
  const out: EnSummaryResult[] = [];
  const take = (i: number, e: Record<string, unknown>) => {
    const item = byIndex.get(i);
    if (!item || seen.has(i)) return;
    const summary = typeof e.summary === "string" ? e.summary.trim() : "";
    if (enSummaryIssues(`${item.title}\n${item.summary}`, summary).length > 0)
      return;
    seen.add(i);
    out.push({ i, summary });
  };
  const hasIndex = rows.some(
    (e) => e !== null && typeof e === "object" && "i" in e
  );
  rows.forEach((entry, position) => {
    if (!entry || typeof entry !== "object") return;
    const e = entry as Record<string, unknown>;
    if (hasIndex) take(Number(e.i), e);
    else if (rows.length === batch.length) take(batch[position].i, e);
  });
  return out;
}
