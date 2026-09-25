import { sanitizeText } from "../../../worker/telemetry-safe.js";
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

export type RunAttemptsState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "error";

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
