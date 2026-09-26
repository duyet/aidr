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

export function shortModel(model: string): string {
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

export type RunStatus = "ok" | "error" | "empty" | "in_progress" | "unknown";

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
  if (run.items_fetched === 0) return "empty";
  if (run.items_fetched == null) return "unknown";
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
