import {
  safeErrorCode,
  safeErrorStatus,
  sanitizeError,
  sanitizeRunStats,
  sanitizeText,
} from "../../worker/telemetry-safe.js";
import { WORKFLOW_RUN_STARTED_AT_ORDER_SQL } from "../../worker/workflow-run.js";
import type { DbReader } from "./db";

const JEV_DEFAULT_MODEL = "typesafe/jev";

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
  /** LLM attempts explicitly tagged with this run id. Empty when identity
   * is unavailable or no calls are recorded. */
  llm?: RunLlmSummary;
}

/** One anyrouter attempt from `llm_calls`, including optional usage split
 * from migration 0016 and explicit identity fields from migration 0025. */
export interface LlmCallRow {
  ts: number;
  /** Authoritative identity from llm_calls.run_id; never inferred by time. */
  runId: string | null;
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
  errorCode: string | null;
  errorStatus: number | null;
}

export interface RunLlmSummary {
  calls: number;
  failures: number;
  tokens: number;
  cachedTokens: number | null;
  durationMs: number;
  /** Distinct models attempted (ok or fail), first-seen order. This is a
   * model inventory, not proof of a fallback transition. */
  models: string[];
  /** Per-attempt rows for the expandable Recent runs detail. */
  attempts: LlmCallRow[];
  /** True when this summary was built from a bounded row read that dropped
   * rows, so the counts above cover only what was read. Never set on the
   * aggregated list path, which counts in SQL and is not row-bounded. */
  truncated?: boolean;
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
      return sanitizeRunStats(parsed) as WorkflowRunStats;
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
    error: sanitizeError(row.error)?.message ?? null,
    stats: parseRunStats(row.stats),
  };
}

function emptyLlmSummary(): RunLlmSummary {
  return {
    calls: 0,
    failures: 0,
    tokens: 0,
    cachedTokens: null,
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
  let cachedKnown = false;
  for (const call of attempts) {
    summary.calls += 1;
    if (!call.ok) summary.failures += 1;
    summary.tokens += call.tokens;
    if (call.cachedTokens != null) {
      cachedKnown = true;
      summary.cachedTokens = (summary.cachedTokens ?? 0) + call.cachedTokens;
    }
    summary.durationMs += call.durationMs;
    if (!seenModels.has(call.model)) {
      seenModels.add(call.model);
      summary.models.push(call.model);
    }
  }
  if (!cachedKnown) summary.cachedTokens = null;
  summary.attempts = includeAttempts ? attempts : [];
  return summary;
}

/** Attribute only calls carrying an explicit matching run id. Timestamps are
 * used solely to order attempts within that authoritative bucket.
 *
 * Row-level helper: callers must bound `calls` themselves (the runs list
 * avoids this shape entirely by aggregating in SQL). `opts.truncated` marks a
 * bounded read whose counts cover only the rows supplied, so a partial total
 * can never be presented as the run's real usage. */
export function attachLlmCallsToRuns(
  runs: WorkflowRunRow[],
  calls: LlmCallRow[],
  opts: { includeAttempts?: boolean; truncated?: boolean } = {}
): WorkflowRunRow[] {
  if (runs.length === 0) return runs;
  const buckets = new Map<string, LlmCallRow[]>();
  for (const run of runs) buckets.set(run.id, []);

  for (const call of calls) {
    if (!call.runId) continue;
    buckets.get(call.runId)?.push(call);
  }

  return runs.map((run) => {
    const attempts = (buckets.get(run.id) ?? []).sort((a, b) => a.ts - b.ts);
    if (attempts.length === 0) return run;
    const summary = summarizeAttempts(attempts, opts.includeAttempts ?? true);
    if (opts.truncated) summary.truncated = true;
    return { ...run, llm: summary };
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
  // Aggregate time series only; this window is never used to attribute a
  // call to a workflow run.
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
let llmRunIdentitySupported: boolean | null = null;
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

async function probeLlmRunIdentity(db: DbReader): Promise<boolean> {
  if (llmRunIdentitySupported != null) return llmRunIdentitySupported;
  try {
    await db.prepare("SELECT run_id FROM llm_calls LIMIT 1").all();
    llmRunIdentitySupported = true;
  } catch {
    llmRunIdentitySupported = false;
  }
  return llmRunIdentitySupported;
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
  run_id?: string | null;
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
  error_code?: string | null;
  error_status?: number | null;
}

function safeRunId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value) ? value : null;
}

function mapLlmCallRow(r: LlmCallDbRow): LlmCallRow {
  const safeError = sanitizeError(r.error);
  return {
    ts: r.ts,
    runId: safeRunId(r.run_id),
    task: sanitizeText(r.task, 80) ?? "other",
    model: sanitizeText(r.model, 160) ?? "unknown",
    ok: r.ok === 1,
    tokens: r.tokens ?? 0,
    durationMs: r.duration_ms ?? 0,
    promptChars: r.prompt_chars ?? null,
    promptTokens: r.prompt_tokens ?? null,
    completionTokens: r.completion_tokens ?? null,
    cachedTokens: r.cached_tokens ?? null,
    error: safeError?.message ?? null,
    errorCode:
      r.error_code != null || safeError
        ? safeErrorCode(r.error_code, safeError?.code ?? "unknown_error")
        : null,
    errorStatus: safeErrorStatus(r.error_status ?? safeError?.status),
  };
}

const LLM_SELECT_COLUMNS = `ts, run_id, task, model, ok, tokens, duration_ms,
  prompt_chars, error, prompt_tokens, completion_tokens, cached_tokens,
  error_code, error_status`;

/** Hard cap on per-call rows read for a *single* expanded run. The runs list
 * never reads rows (it aggregates in SQL), so this cannot starve another run
 * — and hitting it is reported via `truncated`, never silently hidden. */
const LLM_ATTEMPTS_LIMIT = 2000;

interface LlmCallQueryResult {
  attempts: LlmCallRow[];
  truncated: boolean;
}

function finishLlmQuery(results: unknown): LlmCallQueryResult {
  const rows = (results ?? []) as LlmCallDbRow[];
  const attempts = rows.map(mapLlmCallRow).sort((a, b) => a.ts - b.ts);
  return { attempts, truncated: rows.length >= LLM_ATTEMPTS_LIMIT };
}

async function queryLlmCallsByRunId(
  db: DbReader,
  where: string,
  binds: string[]
): Promise<LlmCallQueryResult> {
  try {
    const { results } = await db
      .prepare(
        `SELECT ${LLM_SELECT_COLUMNS}
         FROM llm_calls
         WHERE ${where}
         ORDER BY ts ASC
         LIMIT ${LLM_ATTEMPTS_LIMIT}`
      )
      .bind(...binds)
      .all<LlmCallDbRow>();
    return finishLlmQuery(results);
  } catch {
    // Optional usage/error columns may not exist yet; run_id is required
    // for attribution and remains in this safe fallback query.
    const { results } = await db
      .prepare(
        `SELECT ts, run_id, task, model, ok, tokens, duration_ms,
                prompt_chars, error
         FROM llm_calls
         WHERE ${where}
         ORDER BY ts ASC
         LIMIT ${LLM_ATTEMPTS_LIMIT}`
      )
      .bind(...binds)
      .all<LlmCallDbRow>();
    return finishLlmQuery(results);
  }
}

/**
 * Per-run LLM aggregates computed in SQL, for the runs list.
 *
 * The list payload needs counts, tokens, duration, cached usage and a model
 * inventory — never the per-call rows. Computing them with `GROUP BY run_id`
 * makes the result size a function of the *number of runs* (bounded by the
 * 30-row runs query) rather than the *number of calls*, so a single
 * high-volume run can no longer starve the others and no row cap is needed
 * at all. That matters because the previous shape issued one
 * `ORDER BY ts ASC LIMIT 2000` across every listed run: the cap was global
 * and oldest-first, so a busy run consumed the whole budget and the newest
 * runs came back empty — surfaced to the user as "No model data available."
 * for exactly the run they were trying to inspect.
 *
 * `GROUP_CONCAT(DISTINCT model)` cannot be ordered in SQLite, so the model
 * inventory comes from a second query that aggregates per (run, model) and
 * orders by first-seen `ts`. That result is bounded by runs x distinct
 * models, which is small by construction.
 *
 * A run with no attributed calls is simply absent from the result, so
 * callers keep the existing "no llm key at all" contract and the UI can
 * still tell "unattributed" from "zero calls".
 */
async function loadLlmSummariesForRuns(
  db: DbReader,
  runIds: string[]
): Promise<Map<string, RunLlmSummary>> {
  const out = new Map<string, RunLlmSummary>();
  if (runIds.length === 0) return out;
  const placeholders = runIds.map(() => "?").join(",");

  const agg = await db
    .prepare(
      `SELECT run_id,
              COUNT(*) AS calls,
              SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failures,
              SUM(COALESCE(tokens, 0)) AS tokens,
              SUM(COALESCE(duration_ms, 0)) AS duration_ms,
              SUM(COALESCE(cached_tokens, 0)) AS cached_sum,
              COUNT(cached_tokens) AS cached_known
       FROM llm_calls
       WHERE run_id IN (${placeholders})
       GROUP BY run_id`
    )
    .bind(...runIds)
    .all<{
      run_id: string | null;
      calls: number;
      failures: number | null;
      tokens: number | null;
      duration_ms: number | null;
      cached_sum: number | null;
      cached_known: number | null;
    }>();

  for (const row of agg.results ?? []) {
    const runId = safeRunId(row.run_id);
    // A run id we cannot safely echo back is not attributable.
    if (!runId) continue;
    const cachedKnown = Number(row.cached_known ?? 0) > 0;
    out.set(runId, {
      calls: Number(row.calls ?? 0),
      failures: Number(row.failures ?? 0),
      tokens: Number(row.tokens ?? 0),
      // Absent cached-token usage stays null ("unknown"), never 0.
      cachedTokens: cachedKnown ? Number(row.cached_sum ?? 0) : null,
      durationMs: Number(row.duration_ms ?? 0),
      models: [],
      attempts: [],
    });
  }

  const models = await db
    .prepare(
      `SELECT run_id, model, MIN(ts) AS first_ts
       FROM llm_calls
       WHERE run_id IN (${placeholders})
       GROUP BY run_id, model
       ORDER BY run_id ASC, first_ts ASC`
    )
    .bind(...runIds)
    .all<{ run_id: string | null; model: string }>();

  for (const row of models.results ?? []) {
    const runId = safeRunId(row.run_id);
    if (!runId) continue;
    out.get(runId)?.models.push(sanitizeText(row.model, 160) ?? "unknown");
  }

  return out;
}

/** Merge aggregated summaries onto the run rows they belong to. */
function attachLlmSummariesToRuns(
  runs: WorkflowRunRow[],
  summaries: Map<string, RunLlmSummary>
): WorkflowRunRow[] {
  if (runs.length === 0) return runs;
  return runs.map((run) => {
    const summary = summaries.get(run.id);
    return summary ? { ...run, llm: summary } : run;
  });
}

async function loadLlmCallsForRun(
  db: DbReader,
  runId: string
): Promise<LlmCallQueryResult> {
  return queryLlmCallsByRunId(db, "run_id = ?", [runId]);
}

export type RunAttemptsStatus = "ready" | "unavailable";
export interface RunAttemptsResult {
  attempts: LlmCallRow[];
  status: RunAttemptsStatus;
  /** True when this run had more attempts than the per-run read cap, so the
   * rows below are the first N rather than all of them. */
  truncated: boolean;
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

/** Last 30 workflow runs with only explicitly run-id-attributed LLM usage.
 *
 * Per-run usage is aggregated in SQL (see `loadLlmSummariesForRuns`), so
 * this path is bounded by run count, never truncates, and cannot let one
 * high-volume run hide another's data. Per-call rows are served lazily by
 * `/api/system/run-attempts` for the one expanded run — that is where the
 * row cap and its `truncated` flag apply. */
export async function loadSystemRuns(db: DbReader): Promise<WorkflowRunRow[]> {
  const [{ hasRunStats, hasLlmCalls }, hasLlmRunIdentity] = await Promise.all([
    probeSystemTables(db),
    probeLlmRunIdentity(db),
  ]);
  const { results } = await db
    .prepare(runsSelectSql(hasRunStats, 30))
    .all<RunDbRow>();
  const runRows = (results ?? []).map(normalizeRunRow);
  if (!hasLlmCalls || !hasLlmRunIdentity || runRows.length === 0)
    return runRows;
  try {
    // Aggregated in SQL: bounded by run count, so every listed run keeps its
    // true call count and model inventory no matter how many calls it made.
    const summaries = await loadLlmSummariesForRuns(
      db,
      runRows.map((run) => run.id)
    );
    return attachLlmSummariesToRuns(runRows, summaries);
  } catch {
    // Leave runs without LLM detail rather than falling back to timestamps.
    return runRows;
  }
}

/** Per-run LLM call detail, keyed only by the authoritative run id. */
export async function loadRunAttempts(
  db: DbReader,
  runId: string
): Promise<RunAttemptsResult> {
  const [{ hasLlmCalls }, hasLlmRunIdentity] = await Promise.all([
    probeSystemTables(db),
    probeLlmRunIdentity(db),
  ]);
  if (!hasLlmCalls || !hasLlmRunIdentity) {
    return { attempts: [], status: "unavailable", truncated: false };
  }
  const { attempts, truncated } = await loadLlmCallsForRun(db, runId);
  return { attempts, status: "ready", truncated };
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
  const [{ hasTokens, hasRunStats, hasLlmCalls }, hasLlmRunIdentity] =
    await Promise.all([probeSystemTables(db), probeLlmRunIdentity(db)]);

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
    if (hasLlmRunIdentity) {
      try {
        // Same SQL aggregation as the runs list: bounded by run count, so no
        // run is starved by a busier neighbour and this aggregate endpoint
        // cannot inflate into a multi-megabyte body.
        const summaries = await loadLlmSummariesForRuns(
          db,
          runRowsRaw.map((run) => run.id)
        );
        runRows = attachLlmSummariesToRuns(runRowsRaw, summaries);
      } catch {
        // Leave runs without LLM detail rather than falling back to timestamps.
      }
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
