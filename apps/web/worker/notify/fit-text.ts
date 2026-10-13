/**
 * Fit raw text into a character budget without cutting mid-word.
 *
 * Callers clip the RAW text and escape afterwards (never the reverse), so a
 * cut can never split an HTML entity such as `&amp;`. Lengths are UTF-16
 * units (`String.length`), which is what Telegram counts.
 *
 * Order of preference, best first:
 *   1. the whole text, when it fits;
 *   2. whole leading sentences (no ellipsis: the text is complete);
 *   3. whole leading words plus "…" (last resort, never mid-word).
 */

import { sentenceEnds } from "../sentences.js";

/** Trailing marks that read badly directly before an ellipsis. */
const DANGLING = /[\s,;:\-–—([“"']+$/;

export function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The longest run of whole leading sentences within `budget`, or "". */
export function fitSentences(value: string, budget: number): string {
  const text = normalizeSpace(value);
  let best = 0;
  for (const end of sentenceEnds(text)) {
    if (end > budget) break;
    best = end;
  }
  return text.slice(0, best).trim();
}

/** Whole leading words within `budget` plus "…", or "" when not even one
 *  word fits. Never splits a word. */
export function fitWords(value: string, budget: number): string {
  const text = normalizeSpace(value);
  if (text.length <= budget) return text;
  const room = budget - 1; // the "…"
  if (room < 1) return "";
  const cut = text[room] === " " ? room : text.lastIndexOf(" ", room);
  if (cut <= 0) return "";
  const head = text.slice(0, cut).replace(DANGLING, "");
  return head ? `${head}…` : "";
}

/** Best fit for `budget`: whole text, else whole sentences, else whole
 *  words with an ellipsis. "" when nothing fits. */
export function fitText(value: string, budget: number): string {
  const text = normalizeSpace(value);
  if (text.length <= budget) return text;
  return fitSentences(text, budget) || fitWords(text, budget);
}
