/** Topic, model, and category trends for the /data Trends tab.
 *
 * Pure and isomorphic: the loader shapes D1 rows with `buildTrends` and the
 * tab derives risers and insight cards from the same payload, so every number
 * on the page comes from one cached response. The last day in `days` is today
 * (UTC) and is still filling up; window comparisons use completed days only. */

export type TrendKind = "topic" | "model" | "category";

export interface TrendSeries {
  name: string;
  kind: TrendKind;
  /** One count per entry in `SystemTrends.days`, zero-filled. */
  counts: number[];
}

export interface SystemTrends {
  /** Ascending ISO dates; the last one is today and partial. */
  days: string[];
  series: TrendSeries[];
}

export interface TrendRow {
  day: string;
  name: string;
  count: number;
}

export const TREND_DAYS = 28;
export const COMPARE_WINDOW_DAYS = 7;
export const MAX_TOPICS = 48;
export const MAX_MODELS = 24;
export const MAX_TRACKED = 6;
/** A riser or new entrant needs this many mentions in the current window,
 *  so a jump from 0 to 1 never headlines the page. */
export const MIN_CURRENT_MENTIONS = 3;

/** Versioned model names only: "gpt-6.1-sol" is a model, "openai" is a
 *  company topic. Families cover the slugs the scorer emits today. */
const MODEL_FAMILIES = [
  "gpt",
  "o",
  "claude",
  "opus",
  "sonnet",
  "haiku",
  "gemini",
  "gemma",
  "grok",
  "llama",
  "qwen",
  "deepseek",
  "mistral",
  "glm",
  "kimi",
  "minimax",
  "nemotron",
  "phi",
] as const;
const MODEL_PATTERN = new RegExp(
  `^(?:${MODEL_FAMILIES.join("|")})(?:-[a-z]+)*-?\\d`
);

export function isModelName(name: string): boolean {
  return MODEL_PATTERN.test(name);
}

/** Folds vendor-prefixed duplicates the scorer emits for the same model,
 *  e.g. "claude-sonnet-5.5" into "sonnet-5.5". */
export function canonicalTrendName(raw: string): string {
  const name = raw.trim().toLowerCase();
  return name.replace(/^(?:claude|anthropic)-(?=(?:opus|sonnet|haiku)-)/, "");
}

export function dayRange(today: string, count: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10)
  );
}

function denseSeries(
  rows: TrendRow[],
  days: string[],
  kind: (name: string) => TrendKind,
  rename: (name: string) => string
): TrendSeries[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const byName = new Map<string, TrendSeries>();
  for (const row of rows) {
    const at = index.get(row.day);
    if (at === undefined || !row.name) continue;
    const name = rename(row.name);
    let series = byName.get(name);
    if (!series) {
      series = { name, kind: kind(name), counts: days.map(() => 0) };
      byName.set(name, series);
    }
    series.counts[at] += Number(row.count) || 0;
  }
  return [...byName.values()];
}

const total = (s: TrendSeries) => s.counts.reduce((a, b) => a + b, 0);

function topByTotal(series: TrendSeries[], limit: number): TrendSeries[] {
  return [...series]
    .sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Dense, bounded series for the window ending `today`. Topic rows come from
 *  `topic_daily`, category rows from published items. */
export function buildTrends(
  topicRows: TrendRow[],
  categoryRows: TrendRow[],
  today: string,
  dayCount = TREND_DAYS
): SystemTrends {
  const days = dayRange(today, dayCount);
  const tags = denseSeries(
    topicRows,
    days,
    (name) => (isModelName(name) ? "model" : "topic"),
    canonicalTrendName
  );
  const categories = denseSeries(
    categoryRows,
    days,
    () => "category",
    (name) => name
  );
  return {
    days,
    series: [
      ...topByTotal(
        tags.filter((s) => s.kind === "topic"),
        MAX_TOPICS
      ),
      ...topByTotal(
        tags.filter((s) => s.kind === "model"),
        MAX_MODELS
      ),
      ...topByTotal(categories, categories.length),
    ],
  };
}

export interface WindowStat {
  name: string;
  kind: TrendKind;
  current: number;
  prior: number;
  delta: number;
  /** True when the name had no mentions on any completed day before the
   *  current window. */
  isNew: boolean;
}

/** Last `window` completed days against the `window` days before them.
 *  Today is excluded: a half-filled day would read as a collapse. */
export function windowStat(
  series: TrendSeries,
  window = COMPARE_WINDOW_DAYS
): WindowStat {
  const completed = series.counts.slice(0, -1);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const current = sum(completed.slice(-window));
  const prior = sum(completed.slice(-2 * window, -window));
  const before = sum(completed.slice(0, -window));
  return {
    name: series.name,
    kind: series.kind,
    current,
    prior,
    delta: current - prior,
    isNew: before === 0 && current > 0,
  };
}

export function risers(
  series: TrendSeries[],
  kind: TrendKind,
  limit = 6
): WindowStat[] {
  return series
    .filter((s) => s.kind === kind)
    .map((s) => windowStat(s))
    .filter((s) => s.delta > 0 && s.current >= MIN_CURRENT_MENTIONS)
    .sort((a, b) => b.delta - a.delta || b.current - a.current)
    .slice(0, limit);
}

/** Rank by current-window mentions, with the rank the same name held in the
 *  prior window (null when it had none). */
export interface RankedStat extends WindowStat {
  rank: number;
  priorRank: number | null;
}

export function rankModels(series: TrendSeries[]): RankedStat[] {
  const stats = series
    .filter((s) => s.kind === "model")
    .map((s) => windowStat(s));
  const priorOrder = stats
    .filter((s) => s.prior > 0)
    .sort((a, b) => b.prior - a.prior || a.name.localeCompare(b.name))
    .map((s) => s.name);
  return stats
    .filter((s) => s.current > 0)
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name))
    .map((s, i) => {
      const at = priorOrder.indexOf(s.name);
      return { ...s, rank: i + 1, priorRank: at < 0 ? null : at + 1 };
    });
}

export interface TrendInsights {
  biggestRiser: WindowStat | null;
  newEntrant: WindowStat | null;
  topModel: WindowStat | null;
  volume: { current: number; prior: number; changePct: number | null };
}

export function trendInsights(trends: SystemTrends): TrendInsights {
  const tags = trends.series.filter((s) => s.kind !== "category");
  const stats = tags.map((s) => windowStat(s));
  const riser =
    [...stats]
      .filter((s) => s.delta > 0 && s.current >= MIN_CURRENT_MENTIONS)
      .sort((a, b) => b.delta - a.delta)[0] ?? null;
  const entrant =
    stats
      .filter((s) => s.isNew && s.current >= MIN_CURRENT_MENTIONS)
      .sort((a, b) => b.current - a.current)[0] ?? null;
  const topModel =
    stats
      .filter((s) => s.kind === "model" && s.current > 0)
      .sort((a, b) => b.current - a.current)[0] ?? null;
  const categories = trends.series
    .filter((s) => s.kind === "category")
    .map((s) => windowStat(s));
  const current = categories.reduce((a, s) => a + s.current, 0);
  const prior = categories.reduce((a, s) => a + s.prior, 0);
  return {
    biggestRiser: riser,
    newEntrant: entrant,
    topModel,
    volume: {
      current,
      prior,
      changePct:
        prior > 0 ? Math.round(((current - prior) / prior) * 100) : null,
    },
  };
}

/** `?track=` is a comma-separated string (TanStack JSON-encodes arrays).
 *  Keeps topic-slug characters only, dedupes, and caps the list. */
export function parseTrack(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const name = canonicalTrendName(part).replace(/[^a-z0-9.-]/g, "");
    if (name && !out.includes(name)) out.push(name);
    if (out.length === MAX_TRACKED) break;
  }
  return out;
}

export function formatTrack(names: string[]): string | undefined {
  return names.length > 0 ? names.slice(0, MAX_TRACKED).join(",") : undefined;
}
