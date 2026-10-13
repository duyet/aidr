/**
 * The one sentence splitter. Mail, Telegram, Facebook and the feed clippers
 * all cut text at sentence ends, so they share these boundaries.
 *
 * A mark ends a sentence when whitespace (or the end of the text) follows it
 * and any closing quote. A period after an abbreviation or an initialism does
 * not: "Debuts at No. 2", "on Oct. 12", "Mr. Smith", "U.S. officials".
 */

const SENTENCE_END = /[.!?…]/;
const CLOSERS = /["'”’)\]]/;

/** Always followed by what they introduce (a name, a number, an example). */
const NEVER_ENDS = new Set([
  "No",
  "Nos",
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  "Prof",
  "Sr",
  "Jr",
  "St",
  "Mt",
  "Dept",
  "Govt",
  "Gen",
  "Gov",
  "Sen",
  "Rep",
  "vs",
  "e.g",
  "i.e",
]);

/** Can close a sentence ("sold by Acme Inc."), so they only continue it when
 *  the next word starts lowercase or with a digit ("Oct. 12", "Inc. and"). */
const ENDS_BEFORE_CAPITAL = new Set([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
  "Inc",
  "Corp",
  "Co",
  "Ltd",
  "etc",
  "approx",
]);

/** "U.S." and "Ph.D.": a period after a single capital at a word start, or
 *  after another initial, is not the end of a sentence. */
function isInitialismPeriod(value: string, index: number): boolean {
  const prev = value[index - 1];
  if (!prev || !/^[A-Z]$/.test(prev)) return false;
  const before = value[index - 2];
  return before === undefined || before === "." || /\s/.test(before);
}

function isAbbreviationPeriod(value: string, index: number, end: number) {
  const word = /([A-Za-z][A-Za-z.]*)$/.exec(value.slice(0, index))?.[1];
  if (!word) return false;
  if (NEVER_ENDS.has(word)) return true;
  if (!ENDS_BEFORE_CAPITAL.has(word)) return false;
  const next = /\S/.exec(value.slice(end))?.[0];
  return next !== undefined && !/\p{Lu}/u.test(next);
}

/** Index just past each sentence end. */
export function sentenceEnds(value: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (!SENTENCE_END.test(value[i] ?? "")) continue;
    let end = i + 1;
    while (end < value.length && CLOSERS.test(value[end] ?? "")) end++;
    if (end < value.length && !/\s/.test(value[end] ?? "")) continue;
    if (
      value[i] === "." &&
      (isInitialismPeriod(value, i) || isAbbreviationPeriod(value, i, end))
    ) {
      continue;
    }
    ends.push(end);
  }
  return ends;
}

/** The sentences of `value`, trimmed. Text without a sentence end is one
 *  sentence. */
export function splitSentences(value: string): string[] {
  const text = value.trim();
  const parts: string[] = [];
  let start = 0;
  for (const end of sentenceEnds(text)) {
    parts.push(text.slice(start, end).trim());
    start = end;
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

/** The first sentence including its closing mark; the whole text when it
 *  has no sentence end. */
export function firstSentence(value: string): string {
  return splitSentences(value.replace(/\s+/g, " "))[0] ?? "";
}

/** Index just past the last sentence end at or before `max`, or -1. Decided
 *  on the whole text, so a cut right after "Oct." is not mistaken for an end. */
export function lastSentenceEnd(value: string, max: number): number {
  let best = -1;
  for (const end of sentenceEnds(value)) {
    if (end > max) break;
    best = end;
  }
  return best;
}
