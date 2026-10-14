/**
 * English left in EN→VI output, counted per served model. The translate and
 * backfill-translate steps tally the rows they write into `stats.viEnglish`;
 * the health check sums the last 24h and alerts the owner when one model's
 * rate passes `VI_ENGLISH_ALERT_RATE`. No model call and no extra table.
 *
 * A row counts when its summary has no Vietnamese diacritics
 * (`looksVietnamese`, the same test the TL;DR and day card use). Titles are
 * not judged: the prompt keeps a paper title it cannot render, and product
 * names with versions ("llm-gemini 0.35"), in English on purpose, so an
 * English title over a Vietnamese summary is the expected shape, and those
 * rows cluster by source (arxiv-research, hf-papers) and swing with the
 * day's mix. A summary is prose the model has to translate. The cost is a
 * model that leaves every title English under a Vietnamese summary goes
 * unseen. A half-translated summary is not counted either.
 */

import type { HealthIssue } from "./health.js";
import { looksVietnamese } from "./tldr-lang.js";

export interface ModelViEnglish {
  /** EN→VI rows this model wrote. */
  translated: number;
  /** Of those, rows whose summary has no Vietnamese diacritics. */
  english: number;
}

/** Served model id -> counts. */
export type ViEnglishTally = Record<string, ModelViEnglish>;

/** One written EN→VI row. `model` is null for a Vietnamese passthrough. The
 *  title is left out on purpose (see the file comment). */
export interface ViEnglishRow {
  model: string | null;
  summary: string;
}

/** Below this many rows in 24h a rate is noise. If Laguna's true rate is
 *  its measured 6.4%, one 24h window of 40 rows passes 15% about 1 time in
 *  80 by chance, and one of ~120 rows (a day with Laguna leading translate)
 *  about 1 in 4,000. 5/78 only bounds the true rate to 3-14% (Wilson 95%);
 *  at 12% a 120-row window fires about 1 time in 8. */
export const VI_ENGLISH_MIN_ROWS = 40;
/** 7 days to 2026-10-14, summaries only: gemini 0.2% (1/558), Laguna 2.6%
 *  (2/78), gemma-latest 0% (0/36). Judging titles too read 1.3%, 6.4% and
 *  8.3%, all of the difference titles kept English on purpose. 15% is far
 *  above both; no 24h window that week reached it either way. */
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
    add(tally, row.model, {
      translated: 1,
      english: isEnglish(row.summary) ? 1 : 0,
    });
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

/** Reads `stats.viEnglish` as JSON text (`json_extract`). Anything
 *  malformed reads as no rows. */
export function parseViEnglish(json: unknown): ViEnglishTally {
  if (typeof json !== "string") return {};
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {};
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
      detail: `${model} left English in ${m.english} of ${m.translated} Vietnamese summaries in 24h (${pct(m)}, alert above ${VI_ENGLISH_ALERT_RATE * 100}%)`,
      evidence: viEnglishLines(tally),
    });
  }
  return issues;
}
