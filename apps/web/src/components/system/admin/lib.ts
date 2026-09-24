export interface RunStepInfo {
  name: string;
  action: string;
  reason?: string;
}

export interface WorkflowRun {
  stats?: string | { steps?: RunStepInfo[] } | null;
}

export function lastRunSteps(status: unknown): RunStepInfo[] {
  if (!status || typeof status !== "object") return [];
  const runs = (status as { runs?: WorkflowRun[] }).runs;
  const stats = runs?.[0]?.stats;
  if (!stats) return [];
  const parsed = typeof stats === "string" ? safeParse(stats) : stats;
  const steps = (parsed as { steps?: unknown })?.steps;
  return Array.isArray(steps) ? (steps as RunStepInfo[]) : [];
}

export function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export interface LlmCall {
  ts: string;
  task: string;
  model: string;
  ok: boolean;
  tokens?: number;
  duration_ms?: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cached_tokens?: number | null;
  error?: string | null;
  error_code?: string | null;
  error_status?: number | null;
  run_id?: string | null;
}

export interface ModerationItem {
  id: string;
  source_id: string;
  title: string;
  url: string;
  status: string;
  published_at: number;
  llm_relevance: number | null;
  llm_importance: number | null;
  llm_quality: number | null;
  category: string | null;
  tags: string | null;
  rank_score: number;
  points: number | null;
  comments: number | null;
}

export interface QueueSuggestion {
  id: string;
  item_id: string;
  field: string;
  suggestion: string;
  user_name: string | null;
  rating: number | null;
  created_at: number;
}

export interface QueueSubmission {
  id: string;
  url: string;
  title: string;
  note: string | null;
  user_name: string | null;
  rating: number | null;
  created_at: number;
}

export interface AuditRow {
  ts: number;
  action: string;
  detail?: string | null;
}

export interface RateDraft {
  importance: string;
  quality: string;
}

// Mirrors worker/ranking.ts's rankScore formula — kept in sync manually for
// this client-side "analyze" breakdown display.
export function rankBreakdown(item: ModerationItem) {
  const now = Date.now();
  const ageHours = Math.max(0, (now - item.published_at * 1000) / 3_600_000);
  const importance = item.llm_importance ?? 0;
  const quality = item.llm_quality ?? 0;
  const qualityFactor = 0.6 + 0.4 * (quality / 10);
  const decay = Math.exp(-ageHours / 36);
  const engagement =
    1 + Math.log10(1 + (item.points ?? 0) + 0.5 * (item.comments ?? 0));
  return {
    ageHours,
    qualityFactor,
    decay,
    engagement,
    computed: importance * qualityFactor * decay * engagement,
  };
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const adminBtnClass =
  "rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50";

export const adminActionBtnClass =
  "rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50";
