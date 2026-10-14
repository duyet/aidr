/**
 * The one sentence splitter. Mail, Telegram, Facebook and the feed clippers
 * all cut text at sentence ends, so they share these boundaries.
 *
 * A mark ends a sentence when whitespace (or the end of the text) follows it
 * and any closing quote. A period after an abbreviation or an initialism does
 * not: "Debuts at No. 2", "on Oct. 12", "Mr. Smith", "U.S. officials".
 */

/** Characters and positions the scanner has examined since the last
 *  `resetScanOps()`. Tests assert how this grows with input size, which is
 *  deterministic where a timing ratio is not. */
let scanOps = 0;

export function resetScanOps(): void {
  scanOps = 0;
}

export function readScanOps(): number {
  return scanOps;
}

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
  "Cos",
  "Bros",
  "Assn",
  "Ltd",
  "etc",
  "approx",
]);

/** "U.S." and "Ph.D.": a period after a single capital at a word start, or
 *  after another initial, is not the end of a sentence. This also keeps
 *  "Plan B. It" and "GTA V. Odyssey" whole, which fit-text always did. */
function isInitialismPeriod(value: string, index: number): boolean {
  const prev = value[index - 1];
  if (!prev || !/^[A-Z]$/.test(prev)) return false;
  const before = value[index - 2];
  return before === undefined || before === "." || /\s/.test(before);
}

/** No listed abbreviation is longer than this. */
const MAX_ABBREVIATION = 16;

const WORD_CHAR = /[A-Za-z.]/;

/** The letters and dots right before `index`, or undefined when the run is
 *  too long to be a listed abbreviation. Reads at most MAX_ABBREVIATION
 *  characters, so the scan never grows with the text. */
function wordBefore(value: string, index: number): string | undefined {
  const floor = Math.max(0, index - MAX_ABBREVIATION);
  let start = index;
  while (start > floor && WORD_CHAR.test(value[start - 1] ?? "")) {
    scanOps++;
    start--;
  }
  if (start === floor && start > 0 && WORD_CHAR.test(value[start - 1] ?? "")) {
    return undefined;
  }
  return value.slice(start, index).replace(/^\.+/, "") || undefined;
}

/** A sentence starts with a capital, a digit, or an opening quote or bracket.
 *  Anything else after the mark ("using the", "dẫn dắt") continues it. */
const SENTENCE_START = /[\p{Lu}\p{Nd}"'“‘«([{]/u;

/** A link or an `owner/repo` tag also starts a sentence ("… forever? https://…",
 *  "… shipped. duyet/aidr has the notes"). The owner needs a letter, so a
 *  fraction or date ("12/10", "2026/10/14") stays inside its sentence. */
const LINK_START =
  /(?:https?:\/\/|www\.)\S|(?=[\w.-]*[A-Za-z])[A-Za-z0-9][\w.-]*\/[\w.-]/y;

function startsLink(value: string, index: number): boolean {
  scanOps++;
  LINK_START.lastIndex = index;
  return LINK_START.test(value);
}

function isAbbreviationPeriod(
  value: string,
  index: number,
  next: string | undefined
) {
  const word = wordBefore(value, index);
  if (!word) return false;
  if (NEVER_ENDS.has(word)) return true;
  return (
    ENDS_BEFORE_CAPITAL.has(word) &&
    (next === undefined || !/\p{Lu}/u.test(next))
  );
}

/** Index just past each sentence end, in one pass. */
export function sentenceEnds(value: string): number[] {
  const ends: number[] = [];
  for (let i = 0; i < value.length; i++) {
    scanOps++;
    if (!SENTENCE_END.test(value[i] ?? "")) continue;
    let end = i + 1;
    while (end < value.length && CLOSERS.test(value[end] ?? "")) {
      scanOps++;
      end++;
    }
    if (end < value.length && !/\s/.test(value[end] ?? "")) continue;
    let nextAt = end;
    while (nextAt < value.length && /\s/.test(value[nextAt] ?? "")) {
      scanOps++;
      nextAt++;
    }
    const next = value[nextAt];
    if (
      next !== undefined &&
      !SENTENCE_START.test(next) &&
      !startsLink(value, nextAt)
    ) {
      continue;
    }
    if (
      value[i] === "." &&
      (isInitialismPeriod(value, i) || isAbbreviationPeriod(value, i, next))
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

/** How far past `max` a mark can sit and still be decided right: enough for
 *  the closers and the next word's first character. */
const LOOKAHEAD = 32;

/** Index just past the last sentence end at or before `max`, or -1. Reads only
 *  the window up to `max` plus a lookahead, so a cut right after "Oct." is not
 *  mistaken for an end and a long text costs no more than the clip. */
export function lastSentenceEnd(value: string, max: number): number {
  let best = -1;
  for (const end of sentenceEnds(value.slice(0, max + LOOKAHEAD))) {
    if (end > max) break;
    best = end;
  }
  return best;
}
