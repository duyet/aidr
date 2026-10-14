/**
 * English left in EN→VI output, counted per served model. The translate and
 * backfill-translate steps tally the rows they write into `stats.viEnglish`;
 * the health check sums the last 24h and alerts the owner when one model's
 * rate passes `VI_ENGLISH_ALERT_RATE`. No model call and no extra table.
 *
 * A row counts when its title or summary has no Vietnamese diacritics
 * (`looksVietnamese`, the same test the TL;DR and day card use). It misses a
 * half-translated summary, and it counts English titles the prompt keeps on
 * purpose (paper titles, "llm-gemini 0.35"), so the baseline is not zero.
 */

import type { HealthIssue } from "./health.js";
import { looksVietnamese } from "./tldr-lang.js";

export interface ModelViEnglish {
  /** EN→VI rows this model wrote. */
  translated: number;
  /** Of those, rows whose title or summary has no Vietnamese diacritics. */
  english: number;
}

/** Served model id -> counts. */
export type ViEnglishTally = Record<string, ModelViEnglish>;

/** One written EN→VI row. `model` is null for a Vietnamese passthrough. */
export interface ViEnglishRow {
  model: string | null;
  title: string;
  summary: string;
}

/** Below this many rows in 24h a rate is noise. At Laguna's measured 6.4%
 *  a 40-row day passes 15% about 1 time in 80 by chance; at ~120 rows a
 *  day (the volume once Laguna leads translate) about 1 in 4,000. */
export const VI_ENGLISH_MIN_ROWS = 40;
/** 7 days to 2026-10-14: gemini 1.2% (7/561), Laguna 6.4% (5/78),
 *  gemma-latest 8.3% (3/36: two version strings, one paper title). 15% is
 *  over twice Laguna's rate; no 24h window that week reached it. */
export const VI_ENGLISH_ALERT_RATE = 0.15;
/** One alert per model per window; the rate is a 24h sum, so it stays high
 *  for most of a day after a burst. */
export const VI_ENGLISH_WINDOW_MS = 24 * 3600 * 1000;

/** Not `llm…`: this is a model choice in aidr's chain, not a router fault,
 *  so the GitHub issue goes to duyet/aidr. */
export const VI_ENGLISH_KEY_PREFIX = "translation-english:";

export function viEnglishKey(model: string): string {
  return `${VI_ENGLISH_KEY_PREFIX}${model}`;
}

function isEnglish(text: string): boolean {
  return text.trim() !== "" && !looksVietnamese(text);
}

function add(into: ViEnglishTally, model: string, counts: ModelViEnglish) {
  const m = into[model] ?? { translated: 0, english: 0 };
  into[model] = {
    translated: m.translated + counts.translated,
    english: m.english + counts.english,
  };
}

export function tallyViEnglish(rows: Iterable<ViEnglishRow>): ViEnglishTally {
  const tally: ViEnglishTally = {};
  for (const row of rows) {
    if (!row.model) continue;
    const english = isEnglish(row.title) || isEnglish(row.summary);
    add(tally, row.model, { translated: 1, english: english ? 1 : 0 });
  }
  return tally;
}

export function mergeViEnglish(
  ...tallies: readonly ViEnglishTally[]
): ViEnglishTally {
  const out: ViEnglishTally = {};
  for (const tally of tallies) {
    for (const [model, counts] of Object.entries(tally))
      add(out, model, counts);
  }
  return out;
}

const count = (v: unknown): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;

/** Reads `stats.viEnglish` (an object, or its JSON text from
 *  `json_extract`). Anything malformed reads as no rows. */
export function parseViEnglish(raw: unknown): ViEnglishTally {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const tally: ViEnglishTally = {};
  for (const [model, counts] of Object.entries(value)) {
    if (!counts || typeof counts !== "object") continue;
    const { translated, english } = counts as Record<string, unknown>;
    const t = count(translated);
    if (t === 0) continue;
    tally[model] = { translated: t, english: Math.min(count(english), t) };
  }
  return tally;
}

function pct(m: ModelViEnglish): string {
  return `${Math.round((m.english / m.translated) * 100)}%`;
}

/** "model: english/translated (pct)", busiest model first. */
export function viEnglishLines(tally: ViEnglishTally): string[] {
  return Object.entries(tally)
    .sort((a, b) => b[1].translated - a[1].translated)
    .map(([model, m]) => `${model}: ${m.english}/${m.translated} (${pct(m)})`);
}

/**
 * One warning per model over the threshold in the 24h tally, unless that
 * model's key already fired in the same 24h (`alerted`: every alert key the
 * window's runs recorded).
 */
export function evaluateViEnglish(
  tally: ViEnglishTally,
  alerted: ReadonlySet<string>
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  for (const [model, m] of Object.entries(tally)) {
    if (m.translated < VI_ENGLISH_MIN_ROWS) continue;
    if (m.english / m.translated <= VI_ENGLISH_ALERT_RATE) continue;
    const key = viEnglishKey(model);
    if (alerted.has(key)) continue;
    issues.push({
      key,
      severity: "warning",
      title: "Vietnamese translations keep English",
      detail: `${model} left English in ${m.english} of ${m.translated} Vietnamese titles or summaries in 24h (${pct(m)}, alert above ${VI_ENGLISH_ALERT_RATE * 100}%)`,
      evidence: viEnglishLines(tally),
    });
  }
  return issues;
}
