import { sanitizeError, sanitizeText } from "../../../worker/telemetry-safe.js";
import { formatTokens } from "../../lib/format";
import type {
  LlmCallRow,
  RunLlmSummary,
  RunStepInfo,
  WorkflowRunRow,
  WorkflowRunStats,
} from "../../lib/system-queries";

export function formatDurationSec(
  started: number | null,
  finished: number | null
): number {
  if (!started || !finished) return 0;
  return Math.max(finished - started, 0);
}

export function formatDuration(
  started: number | null,
  finished: number | null
): string {
  const s = formatDurationSec(started, finished);
  if (!s) return "—";
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}

export function formatMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

/** Compact x-axis tick for a run series: `2:05 PM`. A run with no usable
 *  timestamp falls back to an em dash rather than "Invalid Date", so the axis
 *  never prints garbage.
 *
 *  `timeZone: "UTC"` is not cosmetic: it is what {@link formatTimestamp} in
 *  this same file does, so a run reads the same wall-clock time on the chart
 *  axis as it does in its expanded "Recent runs" detail. Leaving it implicit
 *  would also make the label depend on the viewer's machine timezone. */
export function runAxisTime(
  epochSeconds: number | null,
  lang: "en" | "vi"
): string {
  const date = runDate(epochSeconds);
  if (!date) return "—";
  return date.toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Tooltip heading for a run — the full stamp, since the axis only carries the
 *  time and a run series can span two days. Shares `formatTimestamp`'s locale
 *  and timezone rules so the two never disagree. */
export function runAxisHeading(
  epochSeconds: number | null,
  lang: "en" | "vi"
): string {
  return formatTimestamp(epochSeconds, lang);
}

/** Whole seconds → `45s` / `4m`, for axis ticks and summary readouts. Unlike
 *  {@link formatDuration} this takes the value directly, so it is the right
 *  helper for a duration that is already measured. */
export function formatSecondsShort(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}m`;
}

/** Epoch seconds → Date, or null for a missing/unusable timestamp. */
function runDate(epochSeconds: number | null): Date | null {
  if (
    epochSeconds == null ||
    !Number.isFinite(epochSeconds) ||
    epochSeconds <= 0
  )
    return null;
  const date = new Date(epochSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(
  epochSeconds: number | null | undefined,
  lang: "en" | "vi"
): string {
  if (
    epochSeconds == null ||
    !Number.isFinite(epochSeconds) ||
    epochSeconds <= 0
  ) {
    return "—";
  }
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function formatScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(1)
    : "—";
}

export function formatTokenValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? formatTokens(value)
    : "—";
}

/**
 * Keep operational error text readable without letting a provider response or
 * control characters turn the disclosure into an unsafe/sensitive payload dump.
 */
export function formatSafeDetail(value: unknown, maxLength = 240): string {
  return sanitizeText(value, maxLength) ?? "—";
}

export function formatSafeError(value: unknown): string {
  const detail = formatSafeDetail(value, 180);
  if (detail === "—") return detail;
  const status = /^anyrouter request failed:\s*(\d{3})/i.exec(detail);
  if (status) return `anyrouter request failed: ${status[1]}`;
  return detail
    .replace(/https?:\/\/\S+/gi, "[url redacted]")
    .replace(
      /\b(prompt|messages?|content|input|body|response|request)\b\s*[:=]\s*[^,;]+/gi,
      "$1: [redacted]"
    );
}

/** Chart label for a stored model id. Known families get a short name. */
export function tokenBurnModelName(model: string): string {
  const id = model.trim().toLowerCase();
  if (!id) return "Unknown";
  if (id.includes("jev")) return "Jev";
  if (id.startsWith("anyrouter/") || id.startsWith("@preset/"))
    return "AnyRouter";
  if (id.includes("laguna")) return "Laguna";
  if (id.includes("glm")) return "GLM";
  if (id.includes("ling")) return "Ling";
  if (id.includes("gemini")) return "Gemini";
  const short = shortModel(model);
  return short ? short.charAt(0).toUpperCase() + short.slice(1) : "Unknown";
}

export function shortModel(model: string): string {
  // A preset's name is the whole id: "@preset/aidr" → "aidr" reads as a model.
  if (model.startsWith("@")) return model;
  // anyrouter/auto → auto; provider/org/model-name → model-name
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

export function bySourceSubline(stats: WorkflowRunStats): string | null {
  const entries = Object.entries(stats.bySource ?? {}).filter(
    ([, n]) => typeof n === "number" && Number.isFinite(n) && n > 0
  );
  if (entries.length === 0) return null;
  return entries.map(([source, n]) => `${source} ${n}`).join(" · ");
}

function isRunStepInfo(value: unknown): value is RunStepInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const step = value as Record<string, unknown>;
  return (
    typeof step.name === "string" &&
    typeof step.action === "string" &&
    (step.reason === undefined || typeof step.reason === "string")
  );
}

/** Keep malformed/legacy stats JSON from becoming misleading UI rows. */
export function safeRunSteps(
  stats: WorkflowRunStats | null | undefined
): RunStepInfo[] {
  if (!Array.isArray(stats?.steps)) return [];
  return stats.steps.filter(isRunStepInfo).map((step) => ({
    name: step.name,
    action: step.action,
    ...(step.reason ? { reason: step.reason } : {}),
  }));
}

export function hasRunDetails(
  run: Pick<
    WorkflowRunRow,
    "started_at" | "finished_at" | "error" | "stats" | "llm"
  >
): boolean {
  return Boolean(
    run.stats ||
      run.error ||
      run.started_at != null ||
      run.finished_at != null ||
      (run.llm && run.llm.calls > 0)
  );
}

export type RunStatus =
  | "ok"
  | "degraded"
  | "error"
  | "empty"
  | "in_progress"
  | "unknown";

/** Longest a run may stay open before it counts as stalled (runs take ~10m). */
export const RUN_STALL_SEC = 30 * 60;

export type StepState = "ok" | "skipped" | "degraded" | "failed";

const STEP_FAILURE_RE = /\b(?:fail(?:ed|ure)?|error|exhausted|timed out)\b/i;
const STEP_FALLBACK_RE =
  /\b(?:fail(?:ed|ure)?|error|exhausted|timed out|thin|partial)\b|batch_failed/i;
const STEP_IDLE_RE = /^(?:skipped\b|0 (?:pending|candidates)\b|recording$)/i;
/** A step the Workflow engine cut short itself — a deploy resetting its
 * Durable Object, an instance that went away, an internal engine fault, or a
 * timeout. `safeStep` records these on the step log instead of filing a
 * Bugsink issue, so this line is the only place an operator sees them; and
 * because the engine retries before `safeStep` sees the failure, the step's
 * work genuinely did not happen in that run. */
const STEP_INTERRUPTED_RE = /^interrupted\b/i;

/** One step's outcome from its recorded action and reason. A step that did
 *  only part of its work ("translated 2/3") or finished on a fallback
 *  ("generated" + "LLM thin (chain exhausted …)") is degraded, not ok. */
export function stepState(step: {
  action: string;
  reason?: string;
}): StepState {
  const action = step.action.trim();
  const ratio = /(\d+)\s*\/\s*(\d+)/.exec(action);
  if (ratio) {
    const done = Number(ratio[1]);
    const total = Number(ratio[2]);
    if (total > 0 && done === 0) return "failed";
    if (done < total) return "degraded";
  }
  if (STEP_INTERRUPTED_RE.test(action)) return "failed";
  if (STEP_FAILURE_RE.test(action)) return "failed";
  // "skipped" because the step itself threw ("tldr step failed") is a failure.
  if (STEP_IDLE_RE.test(action))
    return step.reason && STEP_FAILURE_RE.test(step.reason)
      ? "failed"
      : "skipped";
  if (step.reason && STEP_FALLBACK_RE.test(step.reason)) return "degraded";
  return "ok";
}

/** Lifecycle of the lazily fetched per-run attempt rows. */
export type RunAttemptsState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "error";

export function runStatus(run: WorkflowRunRow): RunStatus {
  if (run.error) return "error";
  if (run.started_at != null && run.finished_at == null) return "in_progress";
  // The open-run row is written with finished_at = started_at and only the
  // open-run step; close-run replaces it with every step. So a row that
  // still holds just open-run is running, or stalled past RUN_STALL_SEC.
  const recorded = safeRunSteps(run.stats);
  if (
    run.started_at != null &&
    recorded.length === 1 &&
    recorded[0]?.name === "open-run"
  ) {
    const ageSec = Date.now() / 1000 - run.started_at;
    return ageSec < RUN_STALL_SEC ? "in_progress" : "error";
  }
  if (run.items_fetched === 0 && !runMode(run)) return "empty";
  if (run.items_fetched == null && !runMode(run)) return "unknown";
  // A run is only ok when every step is: one failed or partial step means
  // readers may be missing translations or a full TL;DR.
  const states = safeRunSteps(run.stats).map(stepState);
  if (states.some((state) => state === "failed" || state === "degraded"))
    return "degraded";
  return "ok";
}

export interface FallbackTransition {
  task: string;
  from: string;
  to: string;
}

/** Derive fallback only from a real failed→successful transition in one task. */
export function fallbackTransitions(
  attempts: LlmCallRow[]
): FallbackTransition[] {
  const byTask = new Map<string, LlmCallRow[]>();
  for (const attempt of attempts) {
    const list = byTask.get(attempt.task) ?? [];
    list.push(attempt);
    byTask.set(attempt.task, list);
  }
  const transitions: FallbackTransition[] = [];
  for (const [task, taskAttempts] of byTask) {
    const failedModels: string[] = [];
    for (const attempt of [...taskAttempts].sort((a, b) => a.ts - b.ts)) {
      if (!attempt.ok) {
        if (attempt.model && !failedModels.includes(attempt.model)) {
          failedModels.push(attempt.model);
        }
        continue;
      }
      for (const from of failedModels) {
        if (from !== attempt.model) {
          transitions.push({ task, from, to: attempt.model });
        }
      }
      failedModels.length = 0;
    }
  }
  return transitions;
}

/** Identical transitions with a count, most frequent first, so a chain that
 *  fell back the same way 23 times reads as one line. */
export function groupFallbackTransitions(
  transitions: FallbackTransition[]
): (FallbackTransition & { count: number })[] {
  const groups = new Map<string, FallbackTransition & { count: number }>();
  for (const t of transitions) {
    const key = `${t.task}\u0000${t.from}\u0000${t.to}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { ...t, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** A run asked to skip sending (dry run) or to run only some steps. Such
 *  runs fetch nothing by design, so "0 fetched" must not read as empty. */
export function runMode(run: WorkflowRunRow): "dry-run" | "partial" | null {
  if (run.stats?.mode === "dry-run") return "dry-run";
  if (Array.isArray(run.stats?.selectedSteps)) return "partial";
  return null;
}

/** Provider/fallback failures the workflow only reports inside a step's
 * self-reported `reason`/`action` (e.g. a tldr step that ends with
 * "anyrouter chain exhausted: …"). A run whose `llm_calls` rows are missing
 * therefore still has a real error story to show. */
const PROVIDER_HINT =
  /\banyrouter\b|\bjev\b|provider|fallback|chain|upstream|endpoint|\bmodel\b|\brequest\b|\bapi\b/i;
const FAILURE_HINT =
  /fail|exhaust|timeout|timed out|error|missing|unavailable|denied|refus|\b[45]\d{2}\b/i;

export type RunFallbackKind =
  | "chain_exhausted"
  | "http_error"
  | "timeout"
  | "rate_limited"
  | "auth_error"
  | "not_configured"
  | "provider_error";

export interface RunFallbackNote {
  step: string;
  kind: RunFallbackKind;
  /** Scrubbed, bounded classification — never the provider's raw message. */
  detail: string;
}

/** Reuse the telemetry classifier so the disclosure shows the same safe
 * summary the worker would have stored, with the fallback chain kept distinct
 * from a single failed request. */
function classifyFallback(text: string): RunFallbackKind {
  if (/chain exhausted/i.test(text)) return "chain_exhausted";
  const safe = sanitizeError(text);
  switch (safe?.code) {
    case "timeout":
      return "timeout";
    case "rate_limited":
      return "rate_limited";
    case "auth_error":
      return "auth_error";
    case "not_configured":
      return "not_configured";
    default:
      return safe?.status ? "http_error" : "provider_error";
  }
}

/** One note per step that reported a provider/fallback failure in its own
 * explanation. Both fields are bounded + redacted, so an embedded chain
 * cannot smuggle prompts, URLs or credentials into the disclosure. */
export function stepFallbackNotes(steps: RunStepInfo[]): RunFallbackNote[] {
  const notes: RunFallbackNote[] = [];
  for (const step of steps) {
    for (const text of [step.reason, step.action]) {
      if (!text) continue;
      if (!PROVIDER_HINT.test(text) || !FAILURE_HINT.test(text)) continue;
      notes.push({
        step: formatSafeDetail(step.name, 80),
        kind: classifyFallback(text),
        detail: formatSafeDetail(text, 200),
      });
      break;
    }
  }
  return notes;
}

const FALLBACK_KIND_LABEL = {
  en: {
    chain_exhausted: "Fallback chain exhausted",
    http_error: "Provider request failed",
    timeout: "Provider request timed out",
    rate_limited: "Provider rate limit reached",
    auth_error: "Provider authentication failed",
    not_configured: "Provider is not configured",
    provider_error: "Provider error",
  },
  vi: {
    chain_exhausted: "Chuỗi fallback đã cạn",
    http_error: "Yêu cầu tới nhà cung cấp thất bại",
    timeout: "Yêu cầu tới nhà cung cấp bị hết thời gian",
    rate_limited: "Bị giới hạn tần suất từ nhà cung cấp",
    auth_error: "Xác thực nhà cung cấp thất bại",
    not_configured: "Chưa cấu hình nhà cung cấp",
    provider_error: "Lỗi nhà cung cấp",
  },
} as const;

export function runFallbackKindLabel(
  kind: RunFallbackKind,
  lang: "en" | "vi"
): string {
  return FALLBACK_KIND_LABEL[lang][kind];
}

/** Tokens were recorded for this run but no `llm_calls` row carries its
 * run_id: a pre-identity run (logged before run_id stamping) or a run whose
 * attempt telemetry never persisted. Surfaced as an explicit label — never
 * back-filled from a timestamp window. */
export function isPreIdentityRun(
  stats: WorkflowRunStats | null | undefined,
  llm: RunLlmSummary | undefined,
  attempts: LlmCallRow[] = []
): boolean {
  if (attempts.length > 0) return false;
  if (llm && llm.calls > 0) return false;
  const tokens = stats?.tokens;
  return typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0;
}

/** Distinct model ids in first-seen order. A model inventory only — never
 * proof that a fallback actually happened. */
export function distinctModels(attempts: LlmCallRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const attempt of attempts) {
    const model = attempt.model;
    if (!model || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

/**
 * What the Models used panel may claim, given both the data we hold and the
 * state of the per-run attempts lookup.
 *
 * The pre-identity explanation is only sound once a lookup has actually
 * completed and returned zero rows for this run id. If the lookup failed
 * (`error`), is unsupported (`unavailable`), or has not resolved yet
 * (`loading` / `idle`), an empty attempt list says nothing about identity —
 * asserting "logged before run identity shipped" there would invent a cause
 * and contradict the Attempts panel directly below, which is reporting the
 * real lookup state.
 */
export type RunModelsDisclosure =
  | "attributed"
  | "pre_identity"
  | "unavailable"
  | "pending"
  | "none";

export function runModelsDisclosure(
  state: RunAttemptsState,
  models: string[],
  stats: WorkflowRunStats | null | undefined,
  llm: RunLlmSummary | undefined,
  attempts: LlmCallRow[] = []
): RunModelsDisclosure {
  // Models we already hold (run summary, or a completed lookup) win outright,
  // whatever the lookup is doing.
  if (models.length > 0) return "attributed";
  if (attempts.length > 0 || (llm && llm.calls > 0)) return "attributed";
  // A failed or unsupported read is not evidence about identity.
  if (state === "unavailable" || state === "error") return "unavailable";
  // Not resolved yet: claim nothing rather than guess.
  if (state === "loading" || state === "idle") return "pending";
  // `ready` with rows is already "attributed" above, so this is a completed
  // lookup that genuinely returned zero rows for this run id.
  if (state === "empty") {
    return isPreIdentityRun(stats, llm, attempts) ? "pre_identity" : "none";
  }
  return "none";
}

export function nextOpenId(
  currentId: string | null,
  id: string
): string | null {
  return currentId === id ? null : id;
}

/** Scroll target for `/data?tab=runs&run=<id>` deep links. */
export function runAnchorId(id: string): string {
  return `run-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function runDetailsId(id: string): string {
  return `run-details-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function runDisclosureLabel(
  lang: "en" | "vi",
  expanded: boolean
): string {
  if (lang === "vi") {
    return expanded ? "Ẩn chi tiết lần chạy" : "Xem chi tiết lần chạy";
  }
  return expanded ? "Hide run details" : "Show run details";
}

export interface NormalizedRunTokens {
  total: number | null;
  cached: number | null;
  source: "llm" | "attempts" | "stats" | "unknown";
}

function sumTokenValues(
  attempts: LlmCallRow[],
  field: "tokens" | "cachedTokens"
): number | null {
  let total: number | null = null;
  for (const attempt of attempts) {
    const value = attempt[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      total = (total ?? 0) + value;
    }
  }
  return total;
}

/** One normalization path for compact and expanded token totals. */
export function normalizeRunTokens(
  stats: WorkflowRunStats | null | undefined,
  llm?: RunLlmSummary,
  attempts: LlmCallRow[] = []
): NormalizedRunTokens {
  if (llm && llm.calls > 0) {
    return {
      total: Number.isFinite(llm.tokens) && llm.tokens >= 0 ? llm.tokens : null,
      cached:
        typeof llm.cachedTokens === "number" && llm.cachedTokens >= 0
          ? llm.cachedTokens
          : sumTokenValues(attempts, "cachedTokens"),
      source: "llm",
    };
  }
  const attemptTotal = sumTokenValues(attempts, "tokens");
  if (attemptTotal != null) {
    return {
      total: attemptTotal,
      cached: sumTokenValues(attempts, "cachedTokens"),
      source: "attempts",
    };
  }
  if (
    typeof stats?.tokens === "number" &&
    Number.isFinite(stats.tokens) &&
    stats.tokens >= 0
  ) {
    return { total: stats.tokens, cached: null, source: "stats" };
  }
  return { total: null, cached: null, source: "unknown" };
}

export interface TokenBreakdown {
  total: number | null;
  input: number | null;
  output: number | null;
  cached: number | null;
}

/** Sum only the selected run's attempts; absent usage columns stay unknown. */
export function tokenBreakdown(
  attempts: LlmCallRow[],
  stats: WorkflowRunStats | null | undefined,
  llm?: RunLlmSummary
): TokenBreakdown {
  const normalized = normalizeRunTokens(stats, llm, attempts);
  let input: number | null = null;
  let output: number | null = null;
  for (const attempt of attempts) {
    if (typeof attempt.promptTokens === "number" && attempt.promptTokens >= 0) {
      input = (input ?? 0) + attempt.promptTokens;
    }
    if (
      typeof attempt.completionTokens === "number" &&
      attempt.completionTokens >= 0
    ) {
      output = (output ?? 0) + attempt.completionTokens;
    }
  }
  return {
    total: normalized.total,
    input,
    output,
    cached: normalized.cached,
  };
}

export interface ExtraBadge {
  label: string;
  value: number;
}

export function extraBadges(
  stats: WorkflowRunStats,
  lang: "en" | "vi"
): ExtraBadge[] {
  const defs: [keyof WorkflowRunStats, string, string][] = [
    ["backfilledSummaries", "backfill sum", "backfill tóm tắt"],
    ["backfilledTranslations", "backfill vi", "backfill dịch"],
    ["qaRated", "QA", "QA"],
    ["qaAdjusted", "QA adj", "QA sửa"],
    ["suggestionsReviewed", "suggestions", "góp ý"],
    ["submissionsReviewed", "submissions", "bài gửi"],
    ["emailsSent", "emails", "email"],
  ];
  const badges: ExtraBadge[] = [];
  for (const [key, en, vi] of defs) {
    const value = stats[key];
    if (typeof value === "number" && value > 0) {
      badges.push({ label: lang === "vi" ? vi : en, value });
    }
  }
  if (stats.tldrGenerated) {
    badges.push({ label: "AI;DR", value: 1 });
  }
  return badges;
}

export function statusVariant(
  ok: boolean,
  partial: boolean
): "default" | "secondary" | "destructive" | "outline" {
  if (!ok) return "destructive";
  if (partial) return "outline";
  return "secondary";
}

export function llmTokens(
  stats: WorkflowRunStats | null,
  llm?: RunLlmSummary
): number {
  return normalizeRunTokens(stats, llm).total ?? 0;
}

export interface FailedAttemptGroup {
  task: string;
  model: string;
  error: string;
  errorCode: string | null;
  count: number;
}

/** Collapses identical failures (same task, model and error) into one line
 *  with a count, most frequent first, so 13 identical timeouts read as one
 *  problem instead of 13 rows. */
export function groupFailedAttempts(
  attempts: LlmCallRow[]
): FailedAttemptGroup[] {
  const groups = new Map<string, FailedAttemptGroup>();
  for (const attempt of attempts) {
    if (attempt.ok) continue;
    const task = formatSafeDetail(attempt.task, 80);
    const model = formatSafeDetail(attempt.model, 160);
    const error = formatSafeError(attempt.error);
    const key = `${task}\u0000${model}\u0000${attempt.errorCode ?? ""}\u0000${error}`;
    const group = groups.get(key);
    if (group) group.count++;
    else
      groups.set(key, {
        task,
        model,
        error,
        errorCode: attempt.errorCode,
        count: 1,
      });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Attempt row plus the per-invocation id and price (migration 0034). */
export type ChainAttempt = LlmCallRow & {
  callId?: string | null;
  costUsd?: number | null;
};

export interface ChainCall {
  key: string;
  task: string;
  hops: ChainAttempt[];
  ok: boolean;
  durationMs: number;
  tokens: number;
  /** Null when AnyRouter reported no price for any hop. */
  costUsd: number | null;
}

/** One fallback-chain invocation per row: its attempts (hops) in order.
 *  Rows logged with a call id group exactly; older rows are grouped per
 *  task, closing a call at its first success. */
export function groupChainCalls(attempts: ChainAttempt[]): ChainCall[] {
  const sorted = [...attempts].sort((a, b) => a.ts - b.ts);
  const calls: ChainCall[] = [];
  const byId = new Map<string, ChainCall>();
  const openByTask = new Map<string, ChainCall>();
  const start = (a: ChainAttempt, key: string): ChainCall => {
    const call: ChainCall = {
      key,
      task: a.task,
      hops: [],
      ok: false,
      durationMs: 0,
      tokens: 0,
      costUsd: null,
    };
    calls.push(call);
    return call;
  };
  sorted.forEach((a, index) => {
    let call: ChainCall;
    if (a.callId) {
      call = byId.get(a.callId) ?? start(a, a.callId);
      byId.set(a.callId, call);
    } else {
      const open = openByTask.get(a.task);
      call = open && !open.ok ? open : start(a, `${a.task}-${index}`);
      openByTask.set(a.task, call);
    }
    call.hops.push(a);
    call.ok = call.ok || a.ok;
    call.durationMs += a.durationMs;
    call.tokens += a.tokens;
    if (typeof a.costUsd === "number" && Number.isFinite(a.costUsd))
      call.costUsd = (call.costUsd ?? 0) + a.costUsd;
  });
  return calls;
}

export function formatCostUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.0001) return "<$0.0001";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`;
}
