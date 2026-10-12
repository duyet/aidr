/**
 * Weekly edition: the best stories of the last closed ISO week, with an
 * LLM-written intro and one line per story, stored in `weekly_snapshots`
 * (migration 0056) and shown on `/week/YYYY-Www`. See ALGORITHM.md §10b.
 *
 * Built by the ingest `weekly` step. It is a no-op unless the last closed
 * week has no row yet (or only a fallback / English-only row older than
 * `WEEKLY_RETRY_MS`), so the 30-minute schedule makes it a Monday job.
 */
import { stripTitleMarker } from "../src/lib/plain-text.js";
import {
  lastClosedWeek,
  shiftWeek,
  weekBounds,
  weekIssue,
} from "../src/lib/week.js";
import { isProviderFailure } from "./bugsink.js";
import { topBullets } from "./digest/edition.js";
import {
  callAnyrouter,
  parseJson,
  TLDR_SLICE_MAX_MS,
  TRANSLATE_FIRST_TOKEN_MS,
  VI_STYLE,
} from "./llm.js";
import { rankScoreWithoutBreaking, rowRankSignals } from "./ranking.js";
import { pickDiverse } from "./source-diversity.js";
import { looksVietnamese } from "./tldr-lang.js";
import { viSystemPrompt } from "./translation-knowledge.js";
import { stripSourceBoilerplate } from "./translation-terms.js";
import type { Env } from "./types.js";
import { itemVotesTableReady } from "./votes.js";

/** Stories in one weekly edition. */
export const WEEKLY_MAX_STORIES = 10;
/** Week-window rows read besides the ones the daily editions cited. */
const WEEKLY_WINDOW_CANDIDATES = 60;
/** A fallback or English-only row is retried this often, not every run. */
export const WEEKLY_RETRY_MS = 6 * 60 * 60 * 1000;
/** Closed weeks the step looks back over for a missing edition. */
export const WEEKLY_BACKFILL_WEEKS = 4;
/** Whole LLM budget, both passes. Inside the 4-minute step (TLDR_STEP)
 *  with room for the D1 reads, the glossary prompt and the write. */
const WEEKLY_TIMEOUT_MS = 200_000;
/** Passes over the model chain. On 2026-10-10 the first hop streamed no
 *  token in 20s and the other id was down (404 earlier in the run, 502 on
 *  the retry): the chain gave up with ~175s of budget left. */
const WEEKLY_PASSES = 2;
/** A second pass needs at least this much left to be worth a request. */
const WEEKLY_PASS_MIN_MS = 30_000;
const WEEKLY_MAX_TOKENS = 4096;
/** Each day a story led a daily edition adds this much (up to 3 days). */
const EDITION_DAY_BOOST = 0.25;
const EDITION_DAY_CAP = 3;
/** A top-3 spot in any daily edition. */
const EDITION_TOP_BOOST = 0.15;
const LINE_MAX = 260;
const INTRO_MAX = 700;
const AUDIENCE_UTC_OFFSET = "+07:00";

export interface WeeklyCandidate {
  id: string;
  source_id: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  category: string | null;
  importance: number | null;
  quality: number | null;
  points: number;
  comments: number;
  vote_net: number;
  /** Days of the week whose daily edition cited this story. */
  editionDays: number;
  /** Best (0-based) bullet position across those editions, or null. */
  bestPosition: number | null;
}

export interface WeeklyStoryLine {
  item_id: string;
  text: string;
}

export interface WeeklyEdition {
  week: string;
  issue: number;
  start_date: string;
  end_date: string;
  item_ids: string[];
  intro_en: string | null;
  intro_vi: string | null;
  stories_en: WeeklyStoryLine[];
  stories_vi: WeeklyStoryLine[];
  fallback: boolean;
}

/**
 * Week-level importance without time decay. Stored `rank_score` decays with
 * age (36h) and freezes 72h after publish, so on a Monday build a Sunday
 * story would outrank Monday's lead on age alone. This uses the same inputs
 * as `rankScore` at age zero (minus the breaking boost), then rewards days spent in a daily edition:
 * the editors' (LLM's) pick on the day is the strongest signal we have.
 */
export function weeklyScore(c: WeeklyCandidate): number {
  const base = rankScoreWithoutBreaking({
    importance: c.importance ?? 0,
    quality: c.quality ?? 0,
    points: c.points,
    comments: c.comments,
    publishedAt: 0,
    now: 0,
    voteNet: c.vote_net,
  });
  const days = Math.min(c.editionDays, EDITION_DAY_CAP);
  const top = c.bestPosition !== null && c.bestPosition < 3;
  return (
    base * (1 + EDITION_DAY_BOOST * days) * (top ? 1 + EDITION_TOP_BOOST : 1)
  );
}

/** Best stories first, no source family over its share (`pickDiverse`). */
export function rankWeeklyCandidates(
  candidates: readonly WeeklyCandidate[],
  limit = WEEKLY_MAX_STORIES
): WeeklyCandidate[] {
  const scored = candidates
    .map((c) => ({ c, score: weeklyScore(c) }))
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
    .map(({ c }) => c);
  return pickDiverse(scored, { limit });
}

/** Days each item was cited by a daily edition, and its best position.
 * `canonical` maps a merged duplicate to the story it was folded into. */
export function editionHits(
  snapshots: readonly { date: string; bullets_en: string | null }[],
  canonical: ReadonlyMap<string, string> = new Map()
): Map<string, { days: number; best: number }> {
  const hits = new Map<string, { days: Set<string>; best: number }>();
  for (const snap of snapshots) {
    topBullets(snap.bullets_en, 64).forEach((bullet, position) => {
      const ids = bullet.item_ids ?? (bullet.item_id ? [bullet.item_id] : []);
      for (const raw of ids) {
        const id = canonical.get(raw) ?? raw;
        const hit = hits.get(id) ?? { days: new Set<string>(), best: position };
        hit.days.add(snap.date);
        hit.best = Math.min(hit.best, position);
        hits.set(id, hit);
      }
    });
  }
  return new Map(
    [...hits].map(([id, h]) => [id, { days: h.days.size, best: h.best }])
  );
}

/** Why the step should not build, or null to build. Pure for tests. */
export function weeklyGateReason(opts: {
  issue: number | null;
  existing: {
    fallback: number;
    intro_vi: string | null;
    stories_vi: string | null;
    updated_at: number;
  } | null;
  nowMs: number;
}): string | null {
  if (opts.issue === null) return "before the first weekly issue";
  const row = opts.existing;
  if (!row) return null;
  const complete =
    row.fallback === 0 &&
    Boolean(row.intro_vi) &&
    (row.stories_vi ?? "[]") !== "[]";
  if (complete) return "edition already written";
  if (opts.nowMs - row.updated_at < WEEKLY_RETRY_MS) {
    return "incomplete edition retried recently";
  }
  return null;
}

/** One line of model or publisher text, bounded. */
function oneLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export interface WeeklyLlmOutput {
  intro_en: string | null;
  intro_vi: string | null;
  en: Map<string, string>;
  vi: Map<string, string>;
}

/**
 * Keep only what the model wrote for ids we sent. A Vietnamese line or intro
 * without Vietnamese diacritics is the model echoing English: drop it, so
 * the VI column stays empty instead of carrying English.
 */
export function sanitizeWeeklyOutput(
  parsed: unknown,
  ids: ReadonlySet<string>
): WeeklyLlmOutput {
  const out: WeeklyLlmOutput = {
    intro_en: null,
    intro_vi: null,
    en: new Map(),
    vi: new Map(),
  };
  if (!parsed || typeof parsed !== "object") return out;
  const p = parsed as Record<string, unknown>;
  out.intro_en = oneLine(p.intro_en, INTRO_MAX);
  const introVi = oneLine(p.intro_vi, INTRO_MAX);
  out.intro_vi = introVi && looksVietnamese(introVi) ? introVi : null;
  if (Array.isArray(p.stories)) {
    for (const entry of p.stories) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id : null;
      if (!id || !ids.has(id)) continue;
      const en = oneLine(e.en, LINE_MAX);
      const vi = oneLine(e.vi, LINE_MAX);
      if (en) out.en.set(id, en);
      if (vi && looksVietnamese(vi)) out.vi.set(id, vi);
    }
  }
  return out;
}

/**
 * The edition from ranked rows and (optional) model output. English falls
 * back to the item title; Vietnamese falls back to `title_vi` only, never to
 * English, so a story with neither is left out of the VI column.
 */
export function composeWeeklyEdition(
  week: string,
  rows: readonly WeeklyCandidate[],
  llm: WeeklyLlmOutput | null
): WeeklyEdition | null {
  const bounds = weekBounds(week);
  const issue = weekIssue(week);
  if (!bounds || issue === null) return null;
  const lines = composeWeeklyLines(rows, llm);
  if (!lines) return null;
  return {
    week,
    issue,
    start_date: bounds.start,
    end_date: bounds.end,
    ...lines,
  };
}

export interface WeeklyLines {
  item_ids: string[];
  intro_en: string | null;
  intro_vi: string | null;
  stories_en: WeeklyStoryLine[];
  stories_vi: WeeklyStoryLine[];
  fallback: boolean;
}

/** Story lines and intros for any 7-day window (the ISO-week edition and the
 *  rolling weekly digest share it). Null when no story has an English line. */
export function composeWeeklyLines(
  rows: readonly WeeklyCandidate[],
  llm: WeeklyLlmOutput | null
): WeeklyLines | null {
  if (rows.length === 0) return null;
  const stories_en: WeeklyStoryLine[] = [];
  const stories_vi: WeeklyStoryLine[] = [];
  for (const row of rows) {
    const en =
      llm?.en.get(row.id) ?? oneLine(stripTitleMarker(row.title), LINE_MAX);
    if (en) stories_en.push({ item_id: row.id, text: en });
    const titleVi = row.title_vi
      ? oneLine(stripTitleMarker(row.title_vi), LINE_MAX)
      : null;
    const vi =
      llm?.vi.get(row.id) ??
      (titleVi && looksVietnamese(titleVi) ? titleVi : null);
    if (vi) stories_vi.push({ item_id: row.id, text: vi });
  }
  if (stories_en.length === 0) return null;
  const llmUseful = Boolean(llm?.intro_en) && (llm?.en.size ?? 0) > 0;
  return {
    item_ids: rows.map((r) => r.id),
    intro_en: llm?.intro_en ?? null,
    intro_vi: llm?.intro_vi ?? null,
    stories_en,
    stories_vi,
    fallback: !llmUseful,
  };
}

export function weekSecBounds(start: string, end: string) {
  const from = Math.floor(
    Date.parse(`${start}T00:00:00${AUDIENCE_UTC_OFFSET}`) / 1000
  );
  const to =
    Math.floor(Date.parse(`${end}T00:00:00${AUDIENCE_UTC_OFFSET}`) / 1000) +
    86_400;
  return { from, to };
}

interface CandidateRow {
  id: string;
  source_id: string;
  title: string;
  title_vi: string | null;
  summary: string | null;
  category: string | null;
  llm_importance: number | null;
  llm_quality: number | null;
  points: number | null;
  comments: number | null;
  signal_url: string | null;
  merged_members: string | null;
  vote_net: number | null;
}

/** The week's candidates: every published story a daily edition cited
 * (merged duplicates mapped to their canonical) plus the week's strongest
 * uncited stories by importance. Read-only. */
export async function loadWeeklyCandidates(
  env: Pick<Env, "DB">,
  week: string
): Promise<WeeklyCandidate[]> {
  const bounds = weekBounds(week);
  if (!bounds) return [];
  return loadRangeCandidates(env, bounds);
}

/** Candidates for any run of audience-zone days, `start`..`end` inclusive:
 *  the stories the daily editions of those days cited plus the window's
 *  strongest uncited stories. Shared by the ISO-week edition and the rolling
 *  weekly digest (worker/weekly-digest.ts). Read-only. */
export async function loadRangeCandidates(
  env: Pick<Env, "DB">,
  bounds: { start: string; end: string }
): Promise<WeeklyCandidate[]> {
  const { results: snaps } = await env.DB.prepare(
    "SELECT date, bullets_en FROM tldr_snapshots WHERE date >= ? AND date <= ? ORDER BY date"
  )
    .bind(bounds.start, bounds.end)
    .all<{ date: string; bullets_en: string | null }>();
  const citedRaw = new Set<string>();
  for (const [id] of editionHits(snaps ?? [])) citedRaw.add(id);

  const canonical = new Map<string, string>();
  if (citedRaw.size > 0) {
    const { results: dups } = await env.DB.prepare(
      `SELECT id, duplicate_of FROM items
       WHERE id IN (SELECT value FROM json_each(?)) AND duplicate_of IS NOT NULL`
    )
      .bind(JSON.stringify([...citedRaw]))
      .all<{ id: string; duplicate_of: string }>();
    for (const d of dups ?? []) canonical.set(d.id, d.duplicate_of);
  }
  const hits = editionHits(snaps ?? [], canonical);

  const votes = await itemVotesTableReady(env.DB);
  const select = `SELECT i.id, i.source_id, i.title, tr.title AS title_vi,
      i.summary, i.category, i.llm_importance, i.llm_quality, i.points,
      i.comments, i.url AS signal_url,
      (SELECT json_group_array(json_array(m.source_id, m.points, m.comments, m.url))
         FROM items m WHERE m.duplicate_of = i.id AND m.status = 'merged') AS merged_members,
      ${votes ? "COALESCE(vote_sum.vote_net, 0)" : "0"} AS vote_net
    FROM items i
    LEFT JOIN translations tr ON tr.item_id = i.id AND tr.lang = 'vi'
    ${votes ? "LEFT JOIN (SELECT item_id, SUM(value) AS vote_net FROM item_votes GROUP BY item_id) AS vote_sum ON vote_sum.item_id = i.id" : ""}
    WHERE i.status = 'published'`;
  const { from, to } = weekSecBounds(bounds.start, bounds.end);
  const [cited, windowRows] = await Promise.all([
    hits.size > 0
      ? env.DB.prepare(
          // Bounded to the week too: a Monday snapshot's rolling 24h can cite
          // late-Sunday stories, which belong to the previous week's edition.
          `${select} AND i.id IN (SELECT value FROM json_each(?))
           AND i.published_at >= ? AND i.published_at < ?`
        )
          .bind(JSON.stringify([...hits.keys()]), from, to)
          .all<CandidateRow>()
      : Promise.resolve({ results: [] as CandidateRow[] }),
    env.DB.prepare(
      `${select} AND i.published_at >= ? AND i.published_at < ?
       ORDER BY i.llm_importance DESC, i.rank_score DESC
       LIMIT ${WEEKLY_WINDOW_CANDIDATES}`
    )
      .bind(from, to)
      .all<CandidateRow>(),
  ]);
  const byId = new Map<string, WeeklyCandidate>();
  for (const row of [...(cited.results ?? []), ...(windowRows.results ?? [])]) {
    if (byId.has(row.id)) continue;
    const hit = hits.get(row.id);
    // Reader engagement only, best across the cluster: an aggregator's
    // author/tweet counts sit in points/comments but are never ranked (§7).
    const signals = rowRankSignals(row);
    byId.set(row.id, {
      id: row.id,
      source_id: row.source_id,
      title: row.title,
      title_vi: row.title_vi,
      summary: row.summary,
      category: row.category,
      importance: row.llm_importance,
      quality: row.llm_quality,
      points: signals.points,
      comments: signals.comments,
      vote_net: row.vote_net ?? 0,
      editionDays: hit?.days ?? 0,
      bestPosition: hit?.best ?? null,
    });
  }
  return [...byId.values()];
}

export function weeklyPrompt(
  week: string,
  rows: readonly WeeklyCandidate[],
  period = `ISO week ${week}`
) {
  const items = rows.map((r) => ({
    id: r.id,
    title: stripTitleMarker(r.title),
    summary: r.summary
      ? stripSourceBoilerplate(r.summary).slice(0, 400)
      : undefined,
    title_vi: r.title_vi ?? undefined,
  }));
  return `These are the ${rows.length} most important AI/tech stories of ${period}, best first. Write the weekly edition of a news digest, in English and in Vietnamese.

- "intro_en": 2–3 sentences (at most 450 characters) on what defined the week: name the two or three biggest stories and the thread that connects them. Only facts from the items.
- "intro_vi": the same intro the way a Vietnamese tech journalist would write it, following the house style above, never word by word.
- "stories": one entry per item id, in the given order, with "en" (one sentence, 120–200 characters: what happened and why it matters) and "vi" (the same facts in Vietnamese). Keep names, numbers and hedges; add nothing the item does not say.

Items:
${JSON.stringify(items)}

Respond with strict JSON only: {"intro_en":"...","intro_vi":"...","stories":[{"id":"...","en":"...","vi":"..."}]}`;
}

/** Up to two passes over the TL;DR chain inside one budget; null output
 * when every pass failed. `providerFailure` marks a failure the chain
 * absorbed (timeouts, 5xx, accept misses), as opposed to an app bug. */
export async function generateWeeklyCopy(
  env: Env,
  week: string,
  rows: readonly WeeklyCandidate[],
  period?: string
): Promise<{
  output: WeeklyLlmOutput | null;
  tokens: number;
  error?: string;
  providerFailure?: boolean;
}> {
  const ids = new Set(rows.map((r) => r.id));
  const deadline = Date.now() + WEEKLY_TIMEOUT_MS;
  let lastError: unknown = null;
  try {
    const system = await viSystemPrompt(
      env,
      VI_STYLE,
      rows.map((r) => `${r.title}\n${r.summary ?? ""}`).join("\n")
    );
    for (let pass = 1; pass <= WEEKLY_PASSES; pass++) {
      const remaining = deadline - Date.now();
      if (pass > 1 && remaining < WEEKLY_PASS_MIN_MS) break;
      try {
        const { content, tokens } = await callAnyrouter(
          env,
          [
            { role: "system", content: system },
            { role: "user", content: weeklyPrompt(week, rows, period) },
          ],
          {
            json: true,
            modelSpec: env.ANYROUTER_TLDR_MODEL,
            task: "tldr",
            sensitive: true,
            timeoutMs: remaining,
            maxSliceMs: TLDR_SLICE_MAX_MS,
            // The ~14K-char bilingual prompt: 20s to a first token killed
            // a model that answers in 16-30s on a good run.
            firstTokenMs: TRANSLATE_FIRST_TOKEN_MS,
            maxTokens: WEEKLY_MAX_TOKENS,
            accept: (raw) => {
              try {
                const out = sanitizeWeeklyOutput(parseJson(raw), ids);
                return Boolean(out.intro_en) && out.en.size > 0;
              } catch {
                return false;
              }
            },
          }
        );
        return {
          output: sanitizeWeeklyOutput(parseJson(content), ids),
          tokens,
        };
      } catch (error) {
        lastError = error;
        // An app bug will not fix itself on a second pass.
        if (!isProviderFailure(error)) break;
      }
    }
  } catch (error) {
    lastError = error;
  }
  const providerFailure = isProviderFailure(lastError);
  (providerFailure ? console.warn : console.error)(
    "weekly edition LLM failed:",
    lastError
  );
  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  return { output: null, tokens: 0, error: message, providerFailure };
}

export interface WeeklyRunStats {
  generated: boolean;
  tokens: number;
  reason: string;
  week: string;
}

/** Ranks the week and writes its copy without touching D1. */
async function buildWeeklyEdition(
  env: Env,
  week: string
): Promise<{ edition: WeeklyEdition | null; tokens: number; reason: string }> {
  const candidates = await loadWeeklyCandidates(env, week);
  const rows = rankWeeklyCandidates(candidates);
  if (rows.length === 0) {
    return { edition: null, tokens: 0, reason: `no stories in ${week}` };
  }
  const copy = await generateWeeklyCopy(env, week, rows);
  const edition = composeWeeklyEdition(week, rows, copy.output);
  if (!edition) {
    return { edition: null, tokens: copy.tokens, reason: "nothing to persist" };
  }
  const reason = !edition.fallback
    ? `${edition.stories_en.length} EN / ${edition.stories_vi.length} VI stories`
    : copy.providerFailure
      ? // Absorbed by the chain and retried by the gate: no failure words,
        // so health.ts raises no "step-failed" (the LLM failure-rate check
        // still sees the attempts). Detail is in the console.warn above.
        `title fallback, model chain unavailable; retry in ${WEEKLY_RETRY_MS / 3_600_000}h`
      : `LLM failed (${copy.error ?? "no intro"}); title fallback`;
  return { edition, tokens: copy.tokens, reason };
}

interface ExistingWeekRow {
  week: string;
  fallback: number;
  intro_vi: string | null;
  stories_vi: string | null;
  updated_at: number;
  created_at: number;
}

/** Closed weeks the step may still build, oldest first: the last
 * `WEEKLY_BACKFILL_WEEKS`, from the first issue on. A deploy after Monday,
 * or a Monday where every run failed, still gets its week written. */
export function weeksToConsider(nowMs: number): string[] {
  const last = lastClosedWeek(nowMs);
  const weeks: string[] = [];
  for (let back = WEEKLY_BACKFILL_WEEKS - 1; back >= 0; back--) {
    const week = shiftWeek(last, -back);
    if (week && weekIssue(week) !== null) weeks.push(week);
  }
  return weeks;
}

/** The `weekly` ingest step: writes the oldest closed week (within the
 * backfill window) that has no complete edition. At most one LLM call per
 * run; when every week is written it is one D1 read. */
export async function ensureWeeklyEdition(
  env: Env,
  nowMs: number = Date.now()
): Promise<WeeklyRunStats> {
  const weeks = weeksToConsider(nowMs);
  const latest = lastClosedWeek(nowMs);
  if (weeks.length === 0) {
    return {
      generated: false,
      tokens: 0,
      reason: "before the first weekly issue",
      week: latest,
    };
  }
  const { results } = await env.DB.prepare(
    "SELECT week, fallback, intro_vi, stories_vi, updated_at, created_at FROM weekly_snapshots WHERE week >= ?"
  )
    .bind(weeks[0])
    .all<ExistingWeekRow>();
  const rows = new Map((results ?? []).map((row) => [row.week, row]));

  let lastReason = "edition already written";
  let tokens = 0;
  for (const week of weeks) {
    const existing = rows.get(week) ?? null;
    const gate = weeklyGateReason({
      issue: weekIssue(week),
      existing,
      nowMs,
    });
    if (gate) {
      lastReason = gate;
      continue;
    }
    const built = await buildWeeklyEdition(env, week);
    tokens += built.tokens;
    // No stories that week (no LLM call was made): try the next one.
    if (!built.edition) {
      lastReason = built.reason;
      continue;
    }
    // A failed retry must not replace a real edition with title lines.
    if (existing && existing.fallback === 0 && built.edition.fallback) {
      // Restart the retry clock, or an English-only row passes the gate
      // (and costs a full LLM call) on every 30-minute run.
      await env.DB.prepare(
        "UPDATE weekly_snapshots SET updated_at = ? WHERE week = ?"
      )
        .bind(nowMs, week)
        .run();
      return {
        generated: false,
        tokens,
        reason: `kept existing edition: ${built.reason}`,
        week,
      };
    }
    await writeWeeklyEdition(env, built.edition, existing, nowMs);
    return { generated: true, tokens, reason: built.reason, week };
  }
  return { generated: false, tokens, reason: lastReason, week: latest };
}

async function writeWeeklyEdition(
  env: Env,
  edition: WeeklyEdition,
  existing: ExistingWeekRow | null,
  nowMs: number
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO weekly_snapshots (week, issue, start_date, end_date, item_ids,
       intro_en, intro_vi, stories_en, stories_vi, fallback, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week) DO UPDATE SET
       issue = excluded.issue,
       start_date = excluded.start_date,
       end_date = excluded.end_date,
       item_ids = excluded.item_ids,
       intro_en = excluded.intro_en,
       intro_vi = excluded.intro_vi,
       stories_en = excluded.stories_en,
       stories_vi = excluded.stories_vi,
       fallback = excluded.fallback,
       updated_at = excluded.updated_at`
  )
    .bind(
      edition.week,
      edition.issue,
      edition.start_date,
      edition.end_date,
      JSON.stringify(edition.item_ids),
      edition.intro_en,
      edition.intro_vi,
      JSON.stringify(edition.stories_en),
      JSON.stringify(edition.stories_vi),
      edition.fallback ? 1 : 0,
      existing?.created_at ?? nowMs,
      nowMs
    )
    .run();
}

export interface WeeklyPreview extends WeeklyRunStats {
  edition: WeeklyEdition | null;
}

/** What the step would write for `week` (default: last closed week),
 * ignoring the gate. Reads D1 and calls the LLM; never writes
 * `weekly_snapshots`. Used by dry runs. */
export async function previewWeeklyEdition(
  env: Env,
  nowMs: number = Date.now(),
  week: string = lastClosedWeek(nowMs)
): Promise<WeeklyPreview> {
  if (weekIssue(week) === null) {
    return {
      generated: false,
      tokens: 0,
      reason: "before the first weekly issue",
      week,
      edition: null,
    };
  }
  const built = await buildWeeklyEdition(env, week);
  return {
    generated: built.edition !== null,
    tokens: built.tokens,
    reason: `preview: ${built.reason}`,
    week,
    edition: built.edition,
  };
}

/** Bounded preview for `workflow_runs.stats`. */
export function summarizeWeeklyPreview(edition: WeeklyEdition | null): {
  week: string;
  stories: number;
  intro_en: string | null;
  intro_vi: string | null;
  en: string[];
  vi: string[];
} | null {
  if (!edition) return null;
  const head = (lines: WeeklyStoryLine[]) =>
    lines.slice(0, 3).map((l) => l.text.slice(0, 160));
  return {
    week: edition.week,
    stories: edition.stories_en.length,
    intro_en: edition.intro_en?.slice(0, 240) ?? null,
    intro_vi: edition.intro_vi?.slice(0, 240) ?? null,
    en: head(edition.stories_en),
    vi: head(edition.stories_vi),
  };
}
