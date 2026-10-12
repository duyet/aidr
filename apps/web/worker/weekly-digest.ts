/**
 * Rolling weekly digest for weekly email subscribers (migration 0060).
 *
 * A weekly subscriber picks the weekday the mail arrives
 * (`subscribers.weekly_day`). On that local day they get the best stories of
 * the 7 audience-zone days before it. Nothing is summarized per subscriber:
 * the ingest `weekly` step builds one `weekly_digests` row per end date,
 * ranked and written once with the same machinery as the ISO-week edition
 * (`worker/weekly.ts`), and every subscriber due that day reads it.
 *
 * A window ending on a Sunday *is* the ISO-week edition, so Monday
 * subscribers read `weekly_snapshots` and cost no extra LLM call. Other end
 * dates are built only when at least one confirmed weekly subscriber has the
 * matching weekday. See ALGORITHM.md §10c.
 */
import { DEFAULT_WEEKLY_DAY } from "../src/lib/mail-frequency.js";
import { isoWeekOfDate, weekIssue } from "../src/lib/week.js";
import { ensureMailSchema } from "./mail/schema.js";
import { AUDIENCE_TIMEZONE, localCalendarDate } from "./time.js";
import type { Env } from "./types.js";
import {
  composeWeeklyLines,
  generateWeeklyCopy,
  loadRangeCandidates,
  rankWeeklyCandidates,
  WEEKLY_RETRY_MS,
  type WeeklyLines,
} from "./weekly.js";

const DAY_MS = 86_400_000;
/** Days in one digest window, end date included. */
export const DIGEST_WINDOW_DAYS = 7;

/** `date` shifted by `days` calendar days (YYYY-MM-DD, UTC arithmetic). */
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a calendar date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The 7 days a digest mailed on `sendDate` covers: the week before it. */
export function digestWindow(sendDate: string): {
  start: string;
  end: string;
} {
  const end = shiftDate(sendDate, -1);
  return { start: shiftDate(end, -(DIGEST_WINDOW_DAYS - 1)), end };
}

/** A window ending on Sunday is the ISO-week edition (`weekly_snapshots`). */
export function isIsoWeekWindow(endDate: string): boolean {
  return weekdayOf(endDate) === 0;
}

/** `ISO week key` and issue when the window is a whole ISO week. */
export function isoWeekOfWindow(
  endDate: string
): { week: string; issue: number } | null {
  if (!isIsoWeekWindow(endDate)) return null;
  const week = isoWeekOfDate(endDate);
  const issue = weekIssue(week);
  return issue === null ? null : { week, issue };
}

interface ExistingDigestRow {
  fallback: number;
  intro_vi: string | null;
  stories_vi: string | null;
  updated_at: number;
  created_at: number;
}

/** Why the step should not build `endDate`, or null to build. Pure. */
export function digestGateReason(opts: {
  endDate: string;
  demand: boolean;
  existing: ExistingDigestRow | null;
  nowMs: number;
}): string | null {
  if (isIsoWeekWindow(opts.endDate)) return "served by the weekly edition";
  if (!opts.demand) return "no weekly subscriber for this day";
  const row = opts.existing;
  if (!row) return null;
  const complete =
    row.fallback === 0 &&
    Boolean(row.intro_vi) &&
    (row.stories_vi ?? "[]") !== "[]";
  if (complete) return "digest already written";
  if (opts.nowMs - row.updated_at < WEEKLY_RETRY_MS) {
    return "incomplete digest retried recently";
  }
  return null;
}

export interface WeeklyDigestStats {
  generated: boolean;
  tokens: number;
  reason: string;
  endDate: string;
}

/** Is any confirmed weekly subscriber due on `weekday`? A missing column
 *  (schema not upgraded yet) reads as "no". */
async function hasDemand(env: Env, weekday: number): Promise<boolean> {
  try {
    await ensureMailSchema(env.DB);
    const row = await env.DB.prepare(
      `SELECT 1 AS hit FROM subscribers
       WHERE confirmed = 1 AND frequency = 'weekly'
         AND COALESCE(weekly_day, ?) = ?
       LIMIT 1`
    )
      .bind(DEFAULT_WEEKLY_DAY, weekday)
      .first<{ hit: number }>();
    return Boolean(row);
  } catch (error) {
    console.warn("weekly digest demand check failed:", error);
    return false;
  }
}

/** Ranks the window and writes its copy without touching D1. */
export async function buildWeeklyDigest(
  env: Env,
  window: { start: string; end: string }
): Promise<{ lines: WeeklyLines | null; tokens: number; reason: string }> {
  const rows = rankWeeklyCandidates(await loadRangeCandidates(env, window));
  if (rows.length === 0) {
    return { lines: null, tokens: 0, reason: "no stories in the window" };
  }
  const period = `the 7 days from ${window.start} to ${window.end}`;
  const copy = await generateWeeklyCopy(env, window.end, rows, period);
  const lines = composeWeeklyLines(rows, copy.output);
  if (!lines) {
    return { lines: null, tokens: copy.tokens, reason: "nothing to persist" };
  }
  return {
    lines,
    tokens: copy.tokens,
    reason: lines.fallback
      ? `title fallback (${copy.error ?? "no intro"}); retry in ${WEEKLY_RETRY_MS / 3_600_000}h`
      : `${lines.stories_en.length} EN / ${lines.stories_vi.length} VI stories`,
  };
}

/**
 * The digest due today: the window ending yesterday (audience zone), built
 * once when a weekly subscriber has today's weekday. At most one LLM call.
 * Subscribers far east of the audience zone reach their send day before it
 * does; they get the mail once the audience day turns and this row exists.
 */
export async function ensureWeeklyDigest(
  env: Env,
  nowMs: number = Date.now()
): Promise<WeeklyDigestStats> {
  const today = localCalendarDate(nowMs, AUDIENCE_TIMEZONE);
  const window = digestWindow(today);
  const endDate = window.end;
  const demand = isIsoWeekWindow(endDate)
    ? false
    : await hasDemand(env, weekdayOf(today));
  let existing: ExistingDigestRow | null = null;
  if (demand) {
    try {
      existing = await env.DB.prepare(
        "SELECT fallback, intro_vi, stories_vi, updated_at, created_at FROM weekly_digests WHERE end_date = ?"
      )
        .bind(endDate)
        .first<ExistingDigestRow>();
    } catch (error) {
      return {
        generated: false,
        tokens: 0,
        reason: `weekly_digests unavailable: ${error instanceof Error ? error.message : String(error)}`,
        endDate,
      };
    }
  }
  const gate = digestGateReason({ endDate, demand, existing, nowMs });
  if (gate) return { generated: false, tokens: 0, reason: gate, endDate };

  const built = await buildWeeklyDigest(env, window);
  if (!built.lines) {
    return {
      generated: false,
      tokens: built.tokens,
      reason: built.reason,
      endDate,
    };
  }
  // A failed retry must not replace real copy with title lines.
  if (existing && existing.fallback === 0 && built.lines.fallback) {
    await env.DB.prepare(
      "UPDATE weekly_digests SET updated_at = ? WHERE end_date = ?"
    )
      .bind(nowMs, endDate)
      .run();
    return {
      generated: false,
      tokens: built.tokens,
      reason: `kept existing digest: ${built.reason}`,
      endDate,
    };
  }
  const l = built.lines;
  await env.DB.prepare(
    `INSERT INTO weekly_digests (end_date, start_date, item_ids, intro_en,
       intro_vi, stories_en, stories_vi, fallback, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(end_date) DO UPDATE SET
       start_date = excluded.start_date,
       item_ids = excluded.item_ids,
       intro_en = excluded.intro_en,
       intro_vi = excluded.intro_vi,
       stories_en = excluded.stories_en,
       stories_vi = excluded.stories_vi,
       fallback = excluded.fallback,
       updated_at = excluded.updated_at`
  )
    .bind(
      endDate,
      window.start,
      JSON.stringify(l.item_ids),
      l.intro_en,
      l.intro_vi,
      JSON.stringify(l.stories_en),
      JSON.stringify(l.stories_vi),
      l.fallback ? 1 : 0,
      existing?.created_at ?? nowMs,
      nowMs
    )
    .run();
  return {
    generated: true,
    tokens: built.tokens,
    reason: built.reason,
    endDate,
  };
}
