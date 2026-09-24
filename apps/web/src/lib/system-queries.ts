import { JEV_DEFAULT_MODEL } from "../../worker/systemone.js";
import { WORKFLOW_RUN_STARTED_AT_ORDER_SQL } from "../../worker/workflow-run.js";
import type { DbReader } from "./db";

export interface RunStepInfo {
  name: string;
  action: string;
  reason?: string;
}

export interface WorkflowRunStats {
  bySource?: Record<string, number>;
  /** Ordered, self-reported workflow steps captured by migration 0012. */
  steps?: RunStepInfo[];
  new?: number;
  merged?: number;
  rejected?: number;
  published?: number;
  tokens?: number;
  backfilledSummaries?: number;
  backfilledTranslations?: number;
  qaRated?: number;
  qaAdjusted?: number;
  suggestionsReviewed?: number;
  submissionsReviewed?: number;
  tldrGenerated?: number;
  emailsSent?: number;
  notified?: Record<string, number>;
  notifyReason?: Record<string, unknown>;
}

export interface WorkflowRunRow {
  id: string;
  started_at: number | null;
  finished_at: number | null;
  items_fetched: number | null;
  items_new: number | null;
  error: string | null;
  /** Parsed from the `stats` JSON column, added in migration 0012. Older
   * rows (or rows on a DB not yet migrated) have no stats — always null
   * in that case, never a partial/guessed object. */
  stats: WorkflowRunStats | null;
  /** LLM attempts attributed to this run by timestamp window (from
   * `llm_calls`). Empty when the table is missing or no calls overlap. */
  llm?: RunLlmSummary;
}

/** One anyrouter attempt from `llm_calls`, including optional usage split
 * from migration 0016. */
export interface LlmCallRow {
  ts: number;
  task: string;
  model: string;
  ok: boolean;
  tokens: number;
  durationMs: number;
  promptChars: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  error: string | null;
}

export interface RunLlmSummary {
  calls: number;
  failures: number;
  tokens: number;
  cachedTokens: number;
  durationMs: number;
  /** Distinct models attempted (ok or fail), first-seen order — shows
   * fallback chains as e.g. anyrouter/auto → google/gemma-4-…. */
  models: string[];
  /** Per-attempt rows for the expandable Recent runs detail. */
  attempts: LlmCallRow[];
}

/** Best-effort parse of the `stats` JSON column: malformed JSON, a
 * non-object value, or a missing column (pre-migration-0012 DB) all fall
 * back to null rather than throwing, so the runs table just renders the
 * plain columns for that row. */
function parseSourceConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return {};
}

function parseRunStats(raw: unknown): WorkflowRunStats | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as WorkflowRunStats;
    }
    return null;
  } catch {
    return null;
  }
}

export interface DayCount {
  date: string;
  count: number;
}

export interface LlmDayTaskCount {
  date: string;
  task: string;
  calls: number;
  failures: number;
  tokens: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface IngestSourceRow {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  itemCount: number;
  config: Record<string, unknown>;
}

export interface SystemStats {
  totals: {
    items: number;
    translations: number;
    tldrSnapshots: number;
    subscribers: number;
    sources: number;
    itemSourcesRows: number;
  };
  itemsByStatus: NamedCount[];
  itemsBySource: NamedCount[];
  itemsByCategory: NamedCount[];
  itemsPerDay: DayCount[];
  tokens: {
    total: number;
    avgPerItem: number;
    perDay: DayCount[];
  };
  runs: WorkflowRunRow[];
  runsToday: number;
  lastRun: WorkflowRunRow | null;
  latestTldrDate: string | null;
  models: ModelChains;
  llmCallsPerDay: LlmDayTaskCount[];
  ingestSources: IngestSourceRow[];
}

/** Legacy workflow_runs rows may store started_at/finished_at in ms. */
function normalizeTs(v: number | null): number | null {
  if (v == null) return null;
  return v > 1e12 ? Math.floor(v / 1000) : v;
}

function normalizeRunRow(
  row: Omit<WorkflowRunRow, "stats" | "llm"> & {
    stats?: string | null;
  }
): WorkflowRunRow {
  return {
    id: row.id,
    started_at: normalizeTs(row.started_at),
    finished_at: normalizeTs(row.finished_at),
    items_fetched: row.items_fetched,
    items_new: row.items_new,
    error: row.error,
    stats: parseRunStats(row.stats),
  };
}

/** Grace ms after finished_at so trailing log inserts still match. */
const LLM_RUN_GRACE_MS = 15_000;

function emptyLlmSummary(): RunLlmSummary {
  return {
    calls: 0,
    failures: 0,
    tokens: 0,
    cachedTokens: 0,
    durationMs: 0,
    models: [],
    attempts: [],
  };
}

function summarizeAttempts(
  attempts: LlmCallRow[],
  includeAttempts = true
): RunLlmSummary {
  const summary = emptyLlmSummary();
  const seenModels = new Set<string>();
  for (const call of attempts) {
    summary.calls += 1;
    if (!call.ok) summary.failures += 1;
    summary.tokens += call.tokens;
    summary.cachedTokens += call.cachedTokens ?? 0;
    summary.durationMs += call.durationMs;
    if (!seenModels.has(call.model)) {
      seenModels.add(call.model);
      summary.models.push(call.model);
    }
  }
  summary.attempts = includeAttempts ? attempts : [];
  return summary;
}

/** Attribute llm_calls rows to runs by timestamp window. Exported for tests. */
export function attachLlmCallsToRuns(
  runs: WorkflowRunRow[],
  calls: LlmCallRow[],
  opts: { includeAttempts?: boolean } = {}
): WorkflowRunRow[] {
  if (runs.length === 0) return runs;
  const buckets = new Map<string, LlmCallRow[]>();
  for (const run of runs) buckets.set(run.id, []);

  for (const call of calls) {
    let best: WorkflowRunRow | null = null;
    let bestSpan = Number.POSITIVE_INFINITY;
    for (const run of runs) {
      if (run.started_at == null) continue;
      const startMs = run.started_at * 1000;
      const endMs =
        (run.finished_at ?? Math.floor(Date.now() / 1000)) * 1000 +
        LLM_RUN_GRACE_MS;
      if (call.ts < startMs || call.ts > endMs) continue;
      const span = endMs - startMs;
      if (span < bestSpan) {
        bestSpan = span;
        best = run;
      }
    }
    if (best) buckets.get(best.id)?.push(call);
  }

  return runs.map((run) => {
    const attempts = (buckets.get(run.id) ?? []).sort((a, b) => a.ts - b.ts);
    return {
      ...run,
      llm: attempts.length
        ? summarizeAttempts(attempts, opts.includeAttempts ?? true)
        : undefined,
    };
  });
}

export interface ModelChains {
  scoring: string[];
  translation: string[];
  tldr: string[];
  decisions: string[];
}

function splitModelChain(chain: string | undefined): string[] {
  return (chain ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Jev first, then chat models, without duplicating an id that appears in both. */
function jevThenChat(jev: string[], chat: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...jev, ...chat]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Splits the comma-separated ANYROUTER_* model fallback chains into
 * arrays. Public config (which models power scoring/translate/TL;DR/decisions), not
 * a secret — safe to surface on /about and /system.
 *
 * Scoring and decisions try Jev (System One) first. The chat chain stays
 * the backup and is listed after Jev. Translation and TL;DR stay chat-only:
 * Jev does not write prose, and it is rejected on /chat/completions. */
export function getModelChains(env: {
  ANYROUTER_MODEL?: string;
  ANYROUTER_TRANSLATE_MODEL?: string;
  ANYROUTER_TLDR_MODEL?: string;
  ANYROUTER_JEV_MODEL?: string;
}): ModelChains {
  const chat = splitModelChain(env.ANYROUTER_MODEL);
  const translation = splitModelChain(env.ANYROUTER_TRANSLATE_MODEL);
  const tldr = splitModelChain(env.ANYROUTER_TLDR_MODEL);
  const configuredJev = splitModelChain(env.ANYROUTER_JEV_MODEL);
  const jev = configuredJev.length ? configuredJev : [JEV_DEFAULT_MODEL];
  return {
    scoring: jevThenChat(jev, chat),
    translation: translation.length ? translation : chat,
    tldr: tldr.length ? tldr : chat,
    decisions: jevThenChat(jev, chat),
  };
}

/** Read SQL shared by the aggregate /api/system and the granular
 * /api/system/* endpoints. Keep every statement unconditionally safe for
 * db.batch() — a batch aborts entirely if one statement fails, so
 * migration-gated queries stay out unless their probe passed. */
const SQL = {
  itemsCount: "SELECT COUNT(*) AS c FROM items",
  translationsCount: "SELECT COUNT(*) AS c FROM translations",
  tldrCount: "SELECT COUNT(*) AS c FROM tldr_snapshots",
  subscribersCount: "SELECT COUNT(*) AS c FROM subscribers",
  sourcesCount: "SELECT COUNT(*) AS c FROM sources",
  itemSourcesCount: "SELECT COUNT(*) AS c FROM item_sources",
  byStatus:
    "SELECT status AS name, COUNT(*) AS count FROM items GROUP BY status ORDER BY count DESC",
  bySource:
    "SELECT source_id AS name, COUNT(*) AS count FROM items GROUP BY source_id ORDER BY count DESC LIMIT 10",
  byCategory:
    "SELECT COALESCE(category, 'uncategorized') AS name, COUNT(*) AS count FROM items GROUP BY name ORDER BY count DESC LIMIT 10",
  itemsPerDay: `SELECT date(published_at, 'unixepoch') AS date, COUNT(*) AS count
    FROM items
    WHERE status = 'published' AND published_at >= unixepoch('now', '-14 days')
    GROUP BY date ORDER BY date ASC`,
  latestTldr: "SELECT date FROM tldr_snapshots ORDER BY date DESC LIMIT 1",
  tokenTotal: "SELECT SUM(llm_tokens) AS s FROM items",
  tokenAvg:
    "SELECT AVG(llm_tokens) AS a FROM items WHERE llm_tokens IS NOT NULL AND llm_tokens > 0",
  tokenPerDay: `SELECT date(fetched_at, 'unixepoch') AS date, SUM(llm_tokens) AS count
    FROM items
    WHERE fetched_at >= unixepoch('now', '-14 days')
    GROUP BY date ORDER BY date ASC`,
  ingestSources: `SELECT s.id, s.name, s.type, s.config, s.enabled,
           COUNT(i.id) AS item_count
    FROM sources s
    LEFT JOIN items i ON i.source_id = s.id
    GROUP BY s.id
    ORDER BY s.enabled DESC, item_count DESC, s.name`,
  llmCallsPerDay: `SELECT date(ts / 1000, 'unixepoch') AS date,
           task,
           COUNT(*) AS calls,
           SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures,
           SUM(COALESCE(tokens, 0)) AS tokens
    FROM llm_calls
    WHERE ts >= (unixepoch('now') - 14 * 86400) * 1000
    GROUP BY date, task
    ORDER BY date ASC, task ASC`,
} as const;

function runsSelectSql(hasRunStats: boolean, limit: number): string {
  const runColumns = hasRunStats
    ? "id, started_at, finished_at, items_fetched, items_new, error, stats"
    : "id, started_at, finished_at, items_fetched, items_new, error";
  return `SELECT ${runColumns} FROM workflow_runs ORDER BY ${WORKFLOW_RUN_STARTED_AT_ORDER_SQL} DESC, id DESC LIMIT ${limit}`;
}

function firstRow<T>(res: { results?: unknown[] } | undefined): T | null {
  return ((res?.results ?? [])[0] as T) ?? null;
}

function resultRows<T>(res: { results?: unknown[] } | undefined): T[] {
  return (res?.results ?? []) as T[];
}

function mapSourceRow(row: {
  id: string;
  name: string;
  type: string;
  config: string | null;
  enabled: number;
  item_count: number;
}): IngestSourceRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: Number(row.enabled) !== 0,
    itemCount: Number(row.item_count) || 0,
    config: parseSourceConfig(row.config),
  };
}

type RunDbRow = Omit<WorkflowRunRow, "stats" | "llm"> & {
  stats?: string | null;
};

function countRunsToday(runs: WorkflowRunRow[]): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  return runs.filter(
    (r) =>
      r.started_at &&
      new Date(r.started_at * 1000).toISOString().slice(0, 10) === todayStr
  ).length;
}

let llmTokensSupported: boolean | null = null;
let llmCallsSupported: boolean | null = null;
let runStatsSupported: boolean | null = null;

/** Column/table probes run in parallel once per isolate; each flag caches
 * in module scope so repeat hits skip the round-trip. Probes stay
 * individual queries (not batch) because failures are the signal — a D1
 * batch aborts wholesale on one failing statement. */
async function probeSystemTables(db: DbReader): Promise<{
  hasTokens: boolean;
  hasRunStats: boolean;
  hasLlmCalls: boolean;
}> {
  const probe = async (sql: string): Promise<boolean> => {
    try {
      await db.prepare(sql).all();
      return true;
    } catch {
      return false;
    }
  };
  const [hasTokens, hasRunStats, hasLlmCalls] = await Promise.all([
    llmTokensSupported ?? probe("SELECT llm_tokens FROM items LIMIT 1"),
    runStatsSupported ?? probe("SELECT stats FROM workflow_runs LIMIT 1"),
    llmCallsSupported ?? probe("SELECT ts FROM llm_calls LIMIT 1"),
  ]);
  llmTokensSupported = hasTokens;
  runStatsSupported = hasRunStats;
  llmCallsSupported = hasLlmCalls;
  return { hasTokens, hasRunStats, hasLlmCalls };
}

async function loadLlmCallsPerDay(db: DbReader): Promise<LlmDayTaskCount[]> {
  const { results } = await db.prepare(SQL.llmCallsPerDay).all<{
    date: string;
    task: string;
    calls: number;
    failures: number;
    tokens: number | null;
  }>();
  return (results ?? []).map((r) => ({
    date: r.date,
    task: r.task,
    calls: r.calls,
    failures: r.failures,
    tokens: r.tokens ?? 0,
  }));
}

interface LlmCallDbRow {
  ts: number;
  task: string;
  model: string;
  ok: number;
  tokens: number | null;
  duration_ms: number | null;
  prompt_chars: number | null;
  error: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cached_tokens?: number | null;
}

function mapLlmCallRow(r: LlmCallDbRow): LlmCallRow {
  return {
    ts: r.ts,
    task: r.task,
    model: r.model,
    ok: r.ok === 1,
    tokens: r.tokens ?? 0,
    durationMs: r.duration_ms ?? 0,
    promptChars: r.prompt_chars ?? null,
    promptTokens: r.prompt_tokens ?? null,
    completionTokens: r.completion_tokens ?? null,
    cachedTokens: r.cached_tokens ?? null,
    error: r.error ?? null,
  };
}

/** Recent llm_calls covering a time window (usually the last N workflow
 * runs' span). Newest-first limit so Recent runs keep their detail under
 * high volume. `untilMs` bounds the range for single-run lookups. */
async function loadRecentLlmCalls(
  db: DbReader,
  sinceMs: number,
  untilMs?: number
): Promise<LlmCallRow[]> {
  const mapNewestFirst = (results: LlmCallDbRow[] | null | undefined) =>
    (results ?? []).map(mapLlmCallRow).reverse();
  const untilClause = untilMs != null ? " AND ts <= ?" : "";
  const binds: number[] = untilMs != null ? [sinceMs, untilMs] : [sinceMs];

  try {
    const { results } = await db
      .prepare(
        `SELECT ts, task, model, ok, tokens, duration_ms, prompt_chars, error,
                prompt_tokens, completion_tokens, cached_tokens
         FROM llm_calls
         WHERE ts >= ?${untilClause}
         ORDER BY ts DESC
         LIMIT 2000`
      )
      .bind(...binds)
      .all<LlmCallDbRow>();
    return mapNewestFirst(results);
  } catch {
    // Pre-0016 DB without usage columns.
    const { results } = await db
      .prepare(
        `SELECT ts, task, model, ok, tokens, duration_ms, prompt_chars, error
         FROM llm_calls
         WHERE ts >= ?${untilClause}
         ORDER BY ts DESC
         LIMIT 2000`
      )
      .bind(...binds)
      .all<LlmCallDbRow>();
    return mapNewestFirst(results);
  }
}

/** Overview tiles + catalog: counts, token headline, run recert, digest
 * date — one batch, one round-trip. */
export interface SystemOverview {
  totals: SystemStats["totals"];
  tokens: { total: number; avgPerItem: number };
  runsToday: number;
  lastRun: WorkflowRunRow | null;
  latestTldrDate: string | null;
}

export async function loadSystemOverview(
  db: DbReader
): Promise<SystemOverview> {
  const { hasTokens, hasRunStats } = await probeSystemTables(db);
  const stmts = [
    db.prepare(SQL.itemsCount),
    db.prepare(SQL.translationsCount),
    db.prepare(SQL.tldrCount),
    db.prepare(SQL.subscribersCount),
    db.prepare(SQL.sourcesCount),
    db.prepare(SQL.itemSourcesCount),
    db.prepare(runsSelectSql(hasRunStats, 30)),
    db.prepare(SQL.latestTldr),
  ];
  if (hasTokens) {
    stmts.push(db.prepare(SQL.tokenTotal), db.prepare(SQL.tokenAvg));
  }
  const [
    itemsTotal,
    translationsTotal,
    tldrTotal,
    subscribersTotal,
    sourcesTotal,
    itemSourcesTotal,
    runs,
    latestTldr,
    tokenTotalRes,
    tokenAvgRes,
  ] = await db.batch(stmts);

  const runRows = resultRows<RunDbRow>(runs).map(normalizeRunRow);
  const tokenTotal = firstRow<{ s: number | null }>(tokenTotalRes)?.s ?? 0;
  const tokenAvg = Math.round(
    firstRow<{ a: number | null }>(tokenAvgRes)?.a ?? 0
  );

  return {
    totals: {
      items: firstRow<{ c: number }>(itemsTotal)?.c ?? 0,
      translations: firstRow<{ c: number }>(translationsTotal)?.c ?? 0,
      tldrSnapshots: firstRow<{ c: number }>(tldrTotal)?.c ?? 0,
      subscribers: firstRow<{ c: number }>(subscribersTotal)?.c ?? 0,
      sources: firstRow<{ c: number }>(sourcesTotal)?.c ?? 0,
      itemSourcesRows: firstRow<{ c: number }>(itemSourcesTotal)?.c ?? 0,
    },
    tokens: { total: tokenTotal, avgPerItem: tokenAvg },
    runsToday: countRunsToday(runRows),
    lastRun: runRows[0] ?? null,
    latestTldrDate: firstRow<{ date: string }>(latestTldr)?.date ?? null,
  };
}

/** Distributions feeding the items chart and the content tab — one batch. */
export interface SystemActivity {
  itemsPerDay: DayCount[];
  itemsByStatus: NamedCount[];
  itemsBySource: NamedCount[];
  itemsByCategory: NamedCount[];
}

export async function loadSystemActivity(
  db: DbReader
): Promise<SystemActivity> {
  const [byStatus, bySource, byCategory, perDay] = await db.batch([
    db.prepare(SQL.byStatus),
    db.prepare(SQL.bySource),
    db.prepare(SQL.byCategory),
    db.prepare(SQL.itemsPerDay),
  ]);
  return {
    itemsByStatus: resultRows<NamedCount>(byStatus),
    itemsBySource: resultRows<NamedCount>(bySource),
    itemsByCategory: resultRows<NamedCount>(byCategory),
    itemsPerDay: resultRows<DayCount>(perDay),
  };
}

/** Last 30 workflow runs with per-run LLM usage attributed by timestamp
 * window. `includeAttempts: false` strips the per-call rows (the bulk of
 * the old 1.2MB payload); /api/system/run-attempts serves them lazily. */
export async function loadSystemRuns(
  db: DbReader,
  opts: { includeAttempts?: boolean } = {}
): Promise<WorkflowRunRow[]> {
  const { hasRunStats, hasLlmCalls } = await probeSystemTables(db);
  const { results } = await db
    .prepare(runsSelectSql(hasRunStats, 30))
    .all<RunDbRow>();
  const runRows = (results ?? []).map(normalizeRunRow);
  if (!hasLlmCalls || runRows.length === 0) return runRows;
  try {
    const oldestStart = runRows.reduce<number | null>((min, r) => {
      if (r.started_at == null) return min;
      return min == null ? r.started_at : Math.min(min, r.started_at);
    }, null);
    const sinceMs =
      oldestStart != null ? oldestStart * 1000 : Date.now() - 7 * 86400_000;
    const recentCalls = await loadRecentLlmCalls(db, sinceMs);
    return attachLlmCallsToRuns(runRows, recentCalls, opts);
  } catch {
    // leave runs without llm detail
    return runRows;
  }
}

/** Per-run LLM call detail for the expandable RunsList row. */
export async function loadRunAttempts(
  db: DbReader,
  sinceMs: number,
  untilMs: number
): Promise<LlmCallRow[]> {
  const { hasLlmCalls } = await probeSystemTables(db);
  if (!hasLlmCalls) return [];
  return loadRecentLlmCalls(db, sinceMs, untilMs);
}

/** Token burn + per-day usage feeding the overview/LLM tabs — one batch. */
export interface SystemLlm {
  llmCallsPerDay: LlmDayTaskCount[];
  tokens: { total: number; avgPerItem: number; perDay: DayCount[] };
}

export async function loadSystemLlm(db: DbReader): Promise<SystemLlm> {
  const { hasTokens, hasLlmCalls } = await probeSystemTables(db);
  const stmts = [];
  if (hasLlmCalls) stmts.push(db.prepare(SQL.llmCallsPerDay));
  if (hasTokens) {
    stmts.push(
      db.prepare(SQL.tokenTotal),
      db.prepare(SQL.tokenAvg),
      db.prepare(SQL.tokenPerDay)
    );
  }
  const [llmPerDay, tokenTotalRes, tokenAvgRes, tokenPerDayRes] = stmts.length
    ? await db.batch(stmts)
    : [];

  return {
    llmCallsPerDay: resultRows<{
      date: string;
      task: string;
      calls: number;
      failures: number;
      tokens: number | null;
    }>(llmPerDay).map((r) => ({ ...r, tokens: r.tokens ?? 0 })),
    tokens: {
      total: firstRow<{ s: number | null }>(tokenTotalRes)?.s ?? 0,
      avgPerItem: Math.round(
        firstRow<{ a: number | null }>(tokenAvgRes)?.a ?? 0
      ),
      perDay: resultRows<{ date: string; count: number | null }>(
        tokenPerDayRes
      ).map((r) => ({ date: r.date, count: r.count ?? 0 })),
    },
  };
}

/** Ingest source table plus the latest run's per-source pull and lifetime
 * volume — one batch. */
export interface SystemSources {
  ingestSources: IngestSourceRow[];
  lastRunBySource: Record<string, number> | undefined;
  volume: NamedCount[];
}

export async function loadSystemSources(db: DbReader): Promise<SystemSources> {
  const { hasRunStats } = await probeSystemTables(db);
  const [sourceRows, bySource, lastRunRes] = await db.batch([
    db.prepare(SQL.ingestSources),
    db.prepare(SQL.bySource),
    db.prepare(runsSelectSql(hasRunStats, 1)),
  ]);
  const lastRun =
    resultRows<RunDbRow>(lastRunRes).map(normalizeRunRow)[0] ?? null;
  return {
    ingestSources:
      resultRows<Parameters<typeof mapSourceRow>[0]>(sourceRows).map(
        mapSourceRow
      ),
    volume: resultRows<NamedCount>(bySource),
    lastRunBySource: lastRun?.stats?.bySource,
  };
}

/** Aggregate for the public GET /api/system contract (GitHub Actions
 * watchdog, smoke checks, agent discovery). Shares the same batched
 * statements as the granular endpoints — ~4 round-trips instead of one
 * per query. */
export async function loadSystemStats(
  db: DbReader,
  env: {
    ANYROUTER_MODEL?: string;
    ANYROUTER_TRANSLATE_MODEL?: string;
    ANYROUTER_TLDR_MODEL?: string;
    ANYROUTER_JEV_MODEL?: string;
  } = {}
): Promise<SystemStats> {
  const { hasTokens, hasRunStats, hasLlmCalls } = await probeSystemTables(db);

  const stmts = [
    db.prepare(SQL.itemsCount),
    db.prepare(SQL.translationsCount),
    db.prepare(SQL.tldrCount),
    db.prepare(SQL.subscribersCount),
    db.prepare(SQL.sourcesCount),
    db.prepare(SQL.itemSourcesCount),
    db.prepare(SQL.byStatus),
    db.prepare(SQL.bySource),
    db.prepare(SQL.byCategory),
    db.prepare(SQL.itemsPerDay),
    db.prepare(runsSelectSql(hasRunStats, 30)),
    db.prepare(SQL.latestTldr),
    db.prepare(SQL.ingestSources),
  ];
  if (hasTokens) {
    stmts.push(
      db.prepare(SQL.tokenTotal),
      db.prepare(SQL.tokenAvg),
      db.prepare(SQL.tokenPerDay)
    );
  }
  const [
    itemsTotal,
    translationsTotal,
    tldrTotal,
    subscribersTotal,
    sourcesTotal,
    itemSourcesTotal,
    byStatus,
    bySource,
    byCategory,
    perDay,
    runs,
    latestTldr,
    sourceRows,
    tokenTotalRes,
    tokenAvgRes,
    tokenPerDayRes,
  ] = await db.batch(stmts);

  const tokenTotal = firstRow<{ s: number | null }>(tokenTotalRes)?.s ?? 0;
  const tokenAvg = Math.round(
    firstRow<{ a: number | null }>(tokenAvgRes)?.a ?? 0
  );
  const tokenPerDay = resultRows<{ date: string; count: number | null }>(
    tokenPerDayRes
  ).map((r) => ({ date: r.date, count: r.count ?? 0 }));

  const runRowsRaw = resultRows<RunDbRow>(runs).map(normalizeRunRow);
  const runsToday = countRunsToday(runRowsRaw);

  let llmCallsPerDay: LlmDayTaskCount[] = [];
  let runRows = runRowsRaw;
  if (hasLlmCalls) {
    try {
      llmCallsPerDay = await loadLlmCallsPerDay(db);
    } catch {
      llmCallsPerDay = [];
    }
    try {
      const oldestStart = runRowsRaw.reduce<number | null>((min, r) => {
        if (r.started_at == null) return min;
        return min == null ? r.started_at : Math.min(min, r.started_at);
      }, null);
      const sinceMs =
        oldestStart != null ? oldestStart * 1000 : Date.now() - 7 * 86400_000;
      const recentCalls = await loadRecentLlmCalls(db, sinceMs);
      runRows = attachLlmCallsToRuns(runRowsRaw, recentCalls);
    } catch {
      // leave runs without llm detail
    }
  }

  return {
    totals: {
      items: firstRow<{ c: number }>(itemsTotal)?.c ?? 0,
      translations: firstRow<{ c: number }>(translationsTotal)?.c ?? 0,
      tldrSnapshots: firstRow<{ c: number }>(tldrTotal)?.c ?? 0,
      subscribers: firstRow<{ c: number }>(subscribersTotal)?.c ?? 0,
      sources: firstRow<{ c: number }>(sourcesTotal)?.c ?? 0,
      itemSourcesRows: firstRow<{ c: number }>(itemSourcesTotal)?.c ?? 0,
    },
    itemsByStatus: resultRows<NamedCount>(byStatus),
    itemsBySource: resultRows<NamedCount>(bySource),
    itemsByCategory: resultRows<NamedCount>(byCategory),
    itemsPerDay: resultRows<DayCount>(perDay),
    tokens: {
      total: tokenTotal,
      avgPerItem: tokenAvg,
      perDay: tokenPerDay,
    },
    runs: runRows,
    runsToday,
    lastRun: runRows[0] ?? null,
    latestTldrDate: firstRow<{ date: string }>(latestTldr)?.date ?? null,
    models: getModelChains(env),
    llmCallsPerDay,
    ingestSources:
      resultRows<Parameters<typeof mapSourceRow>[0]>(sourceRows).map(
        mapSourceRow
      ),
  };
}
