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

const SENTENCE_END = /[.!?…]/;
const CLOSERS = /["'”’)\]]/;
/** Trailing marks that read badly directly before an ellipsis. */
const DANGLING = /[\s,;:\-–—([“"']+$/;

export function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** "U.S." and "Ph.D.": a period after a single capital at a word start, or
 *  after another initial, is not the end of a sentence. */
export function isInitialismPeriod(value: string, index: number): boolean {
  if (value[index] !== ".") return false;
  const prev = value[index - 1];
  if (!prev || !/^[A-Z]$/.test(prev)) return false;
  const before = value[index - 2];
  return before === undefined || before === "." || /\s/.test(before);
}

/** Index just past each sentence end. A mark ends a sentence only when
 *  whitespace (or the end of the text) follows it and any closing quote. */
function sentenceEnds(value: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!SENTENCE_END.test(value[i] ?? "")) continue;
    if (isInitialismPeriod(value, i)) continue;
    let end = i + 1;
    while (end < value.length && CLOSERS.test(value[end] ?? "")) end++;
    if (end < value.length && !/\s/.test(value[end] ?? "")) continue;
    ends.push(end);
  }
  return ends;
}

/** The first sentence including its closing mark; the whole text when it
 *  has no sentence end. */
export function firstSentence(value: string): string {
  const text = normalizeSpace(value);
  const end = sentenceEnds(text)[0];
  return end === undefined ? text : text.slice(0, end).trim();
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
