import { firstSentence } from "../sentences.js";
import { normalizeSpace } from "./fit-text.js";

/** Share of the headline's content words a restating clause repeats. */
const RESTATED_TITLE_SHARE = 0.8;
/** Largest share of a restating clause's content words that may be new. */
const RESTATED_NEW_WORD_SHARE = 0.2;

const WORD = /[\p{L}\p{N}]+/gu;
const DASH = /\s+[—–-]\s+/;
const TRAILING_SOURCE = /\s*\([^()]*\)\s*$/;

const NAME = String.raw`[\p{Lu}@][\p{L}\p{N}.&'’_-]*`;
const BYLINE = new RegExp(
  String.raw`^${NAME}(?:(?:\s*/\s*|\s+(?:từ|from)\s+|\s+)${NAME}){0,7}\s?:\s+`,
  "u"
);

const STOPWORDS = new Set(
  [
    ...["a", "an", "the", "of", "to", "in", "on", "at", "for", "from", "by"],
    ...["with", "and", "or", "but", "as", "into", "over", "about", "than"],
    ...["is", "are", "was", "were", "be", "been", "has", "have", "had"],
    ...["it", "its", "this", "that", "these", "those", "their", "which"],
    ...["who", "also", "just", "will", "so", "such"],
    ...["các", "những", "một", "của", "và", "là", "đã", "đang", "sẽ", "với"],
    ...["này", "đó", "vừa", "để", "trong", "từ", "về", "khi", "tại", "ở"],
    ...["rằng", "vào", "cũng", "như", "thì", "mà", "được", "bị", "cho"],
  ].map(stem)
);

/** Spelled-out numbers count as numbers: "three researchers", "its first". */
const NUMBER_WORDS = new Set(
  [
    ...["one", "two", "three", "four", "five", "six", "seven", "eight"],
    ...["nine", "ten", "dozen", "hundred", "thousand", "million", "billion"],
    ...["trillion", "half", "first", "second", "third", "fourth", "fifth"],
  ].map(stem)
);

/** Words that turn a repeat into a different claim when the headline lacks
 *  them: a hedge, a denial or a negation. */
const QUALIFIERS = [
  ...["not", "no", "never", "none", "nor", "neither", "without", "cannot"],
  ...["deny", "denies", "denied", "denying", "denial", "reject", "rejects"],
  ...["rejected", "dispute", "disputes", "disputed", "refute", "refutes"],
  ...["refuted", "reportedly", "allegedly", "alleged", "alleges"],
  ...["according to", "source", "sources", "rumor", "rumors", "rumored"],
  ...["unconfirmed", "may", "might", "could", "possibly", "likely"],
  ...["unlikely", "không", "chưa", "chẳng", "phủ nhận", "bác bỏ"],
  ...["được cho là", "cáo buộc", "theo", "có thể", "có lẽ", "dường như"],
  ...["nguồn tin", "tin đồn"],
]
  .map(
    (phrase) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, "iu")
  )
  .concat(/n['’]t(?![\p{L}\p{N}])/iu);

interface Token {
  word: string;
  capital: boolean;
}

interface Headline {
  text: string;
  /** Every word, the trailing "(Author/Outlet)" included. */
  words: Set<string>;
  /** Content words without the trailing source, for coverage. */
  content: Set<string>;
  /** Capitalized words without the trailing source, in headline order. */
  names: string[];
}

/** "launches", "launched" and "launching" compare equal; so do "bans" and
 *  "banned". Numbers stay as written. */
function stem(word: string): string {
  if (/\d/.test(word)) return word;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length).replace(/([^aeiouy])\1$/, "$1");
    }
  }
  return word;
}

function tokens(text: string): Token[] {
  return [...text.matchAll(WORD)]
    .map((m) => ({
      word: stem(m[0].toLowerCase()),
      capital: /^\p{Lu}/u.test(m[0]),
    }))
    .filter((t) => t.word.length > 1);
}

function isNumber(t: Token): boolean {
  return /\d/.test(t.word) || NUMBER_WORDS.has(t.word);
}

function readHeadline(title: string): Headline {
  const body = tokens(title.replace(TRAILING_SOURCE, ""));
  return {
    text: title,
    words: new Set(tokens(title).map((t) => t.word)),
    content: new Set(
      body.filter((t) => !STOPWORDS.has(t.word)).map((t) => t.word)
    ),
    names: [...new Set(body.filter((t) => t.capital).map((t) => t.word))],
  };
}

/** Whether the clause names the headline's names in the headline's order,
 *  each by its first mention. */
function keepsNameOrder(names: string[], own: Token[]): boolean {
  const mentioned = [
    ...new Set(own.filter((t) => t.capital).map((t) => t.word)),
  ];
  const order = mentioned
    .map((word) => names.indexOf(word))
    .filter((at) => at !== -1);
  return order.every((at, i) => i === 0 || at > (order[i - 1] ?? -1));
}

function restates(headline: Headline, clause: string): boolean {
  const own = tokens(clause);
  const content = own.filter((t) => !STOPWORDS.has(t.word));
  if (content.length === 0 || headline.content.size === 0) return false;
  const mine = new Set(content.map((t) => t.word));
  const repeated = [...headline.content].filter((w) => mine.has(w)).length;
  if (repeated / headline.content.size < RESTATED_TITLE_SHARE) return false;
  const added = content.filter((t) => !headline.words.has(t.word));
  if (added.length / content.length > RESTATED_NEW_WORD_SHARE) return false;
  if (added.some((t) => isNumber(t) || t.capital)) return false;
  if (QUALIFIERS.some((q) => q.test(clause) && !q.test(headline.text))) {
    return false;
  }
  return keepsNameOrder(headline.names, own);
}

function withoutByline(sentence: string): string {
  const byline = BYLINE.exec(sentence)?.[0];
  if (!byline || !/\/| từ | from | :/u.test(byline)) return sentence;
  return sentence.slice(byline.length);
}

/** The sentence minus its leading clauses that restate the headline: the
 *  sentence itself when its first clause adds a fact, "" when every clause
 *  restates. A dropped clause takes the byline with it. */
function afterRestatedClauses(headline: Headline, sentence: string): string {
  const body = withoutByline(sentence);
  let rest = body;
  while (rest) {
    const dash = DASH.exec(rest);
    const clause = dash ? rest.slice(0, dash.index) : rest;
    if (!restates(headline, clause)) break;
    rest = dash ? rest.slice(dash.index + dash[0].length) : "";
  }
  if (rest === body) return sentence;
  const lead = /^[\p{L}\p{N}]+/u.exec(rest)?.[0] ?? "";
  if (lead !== lead.toLowerCase()) return rest;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * Drops the leading summary text that only repeats a story's headline, so a
 * caption does not print the same news twice under its bold title.
 *
 * Each leading sentence loses its byline ("Robert Hart / The Verge :") and is
 * split into clauses at a spaced dash. A clause is dropped only when its
 * content words are nearly all the headline's and it adds no fact: no new
 * number, no new name, no hedge, denial or negation, and the headline's names
 * in the same order ("Microsoft sues OpenAI" is not "OpenAI sues Microsoft").
 * The first clause that adds anything stays, with everything after it.
 */
export function withoutRestatedHeadline(
  title: string,
  summary: string
): string {
  const headline = readHeadline(title);
  let rest = normalizeSpace(summary);
  while (rest) {
    const lead = firstSentence(rest);
    const kept = afterRestatedClauses(headline, lead);
    if (kept === lead) break;
    rest = `${kept} ${rest.slice(lead.length).trim()}`.trim();
    if (kept) break;
  }
  return rest;
}
