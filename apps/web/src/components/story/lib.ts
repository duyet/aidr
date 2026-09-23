import type { Lang } from "../../lib/types";

export function fmtTime(epochSec: number, lang: Lang): string {
  return new Date(epochSec * 1000).toLocaleString(
    lang === "vi" ? "vi-VN" : "en-US",
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
  );
}

export function splitParagraphs(text: string | null): string[] {
  return text
    ? text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
}
