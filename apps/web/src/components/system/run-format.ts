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
  if (typeof value !== "string" || !value.trim()) return "—";
  const limit = Number.isFinite(maxLength)
    ? Math.max(1, Math.floor(maxLength))
    : 240;
  // Bound the input before normalization so a provider body cannot turn a
  // small disclosure into an unbounded client-side string operation.
  const bounded = value.length > limit * 4 ? value.slice(0, limit * 4) : value;
  const withoutControls = [...bounded]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? " " : char;
    })
    .join("");
  const normalized = withoutControls.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
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
  const total =
    llm && llm.calls > 0
      ? llm.tokens
      : typeof stats?.tokens === "number"
        ? stats.tokens
        : null;
  let input: number | null = null;
  let output: number | null = null;
  let cached: number | null = null;
  for (const attempt of attempts) {
    if (attempt.promptTokens != null) {
      input = (input ?? 0) + attempt.promptTokens;
    }
    if (attempt.completionTokens != null) {
      output = (output ?? 0) + attempt.completionTokens;
    }
    if (attempt.cachedTokens != null) {
      cached = (cached ?? 0) + attempt.cachedTokens;
    }
  }
  return { total, input, output, cached };
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
  if (llm && llm.tokens > 0) return llm.tokens;
  return stats?.tokens ?? 0;
}
