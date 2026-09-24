import { formatTokens } from "../../lib/format";
import type { Lang } from "../../lib/types";

/**
 * The story read model currently has a story-level total only. It has no
 * workflow_run_id, so callers must not infer a run from a nearby timestamp.
 * A future server-side item/run relation can supply the richer run context.
 * Only positive finite story totals are actionable; null stays unknown.
 */
export function storyTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function formatStoryTokens(value: unknown): string {
  const count = storyTokenCount(value);
  return count == null ? "—" : formatTokens(count);
}

export function formatStoryScore(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(1)
    : "—";
}

export function formatStoryTimestamp(value: unknown, lang: Lang): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  const date = new Date(value * 1000);
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

export function nextDisclosureId(
  currentId: string | null,
  id: string
): string | null {
  return currentId === id ? null : id;
}

export function storyDisclosureLabel(lang: Lang, expanded: boolean): string {
  if (lang === "vi") {
    return expanded ? "Ẩn chi tiết token" : "Xem chi tiết token";
  }
  return expanded ? "Hide token details" : "Show token details";
}

export function storyTokenAriaLabel(
  lang: Lang,
  expanded: boolean,
  count: number
): string {
  const unit = lang === "vi" ? "token" : "tokens";
  return `${storyDisclosureLabel(lang, expanded)} · ${formatTokens(count)} ${unit}`;
}
