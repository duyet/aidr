/**
 * A summary clause that repeats the caption's headline is dropped only when
 * it adds no new word. Any word the headline lacks, other than an article,
 * conjunction, preposition or copula, keeps it: a number, a name, a date, a
 * hedge, "plans", "ended". A share of new words is not enough, because one
 * changed word under a long headline always stays under the share.
 *
 * So a reworded repeat stays: "approximately" for "~" and "following" for
 * "after" are new words. A repeated clause costs a line; a dropped fact is a
 * correctness bug.
 */
import { firstSentence } from "../sentences.js";
import { normalizeSpace } from "./fit-text.js";

/** Share of the headline's content words a restating clause repeats. */
const RESTATED_TITLE_SHARE = 0.8;

/** A number keeps its separators ("1.000", "2,000", "8.8"), so "2.000" never
 *  matches the "000" of "1.000". */
const TOKEN = /\d+(?:[.,]\d+)*[\p{L}\p{N}]*|[\p{L}\p{N}]+/gu;
const POSSESSIVE = /['’]s(?![\p{L}\p{N}])/gu;
const DASH = /\s+[—–-]\s+/;
const TRAILING_SOURCE = /\s*\([^()]*\)\s*$/;

const NAME = String.raw`[\p{Lu}@][\p{L}\p{N}.&'’_-]*`;
const BYLINE = new RegExp(
  String.raw`^${NAME}(?:(?:\s*/\s*|\s+(?:từ|from)\s+|\s+)${NAME}){0,7}\s?:\s+`,
  "u"
);

/** The only words a restating clause may add: articles, conjunctions and
 *  prepositions. "một" is read as the article. Tense, aspect, modal, time,
 *  quantity and hedge words are content: "has launched" under "will launch"
 *  says it happened, not that it is planned. So EN "is/was/has/had/be" and VI
 *  "đã/đang/sẽ/vừa" count, as do "will", "after", "over", "about", "just".
 *  Voice and hedge carriers count too: EN "to/by" ("to buy", "acquired by")
 *  and VI "được/bị" ("được cho là" = reportedly, "bị kiện" = is sued). */
const STOPWORDS = new Set(
  [
    ...["a", "an", "the", "and", "or", "but", "that", "than", "as"],
    ...["of", "in", "on", "at", "for", "from", "with", "into"],
    ...["onto", "via"],
    ...["các", "những", "một", "và", "hoặc", "nhưng", "rằng", "mà", "của"],
    ...["với", "để", "trong", "từ", "về", "tại", "ở", "vào", "cho", "là"],
  ].map(stem)
);

interface Token {
  word: string;
  /** Has a capital anywhere: "Nvidia", "xAI", "iPhone". */
  name: boolean;
}

interface Headline {
  /** Every word, the trailing "(Author/Outlet)" included. */
  words: Set<string>;
  /** Content words without the trailing source, for coverage. */
  content: Set<string>;
  /** Names without the trailing source, in headline order. */
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
  const plain = text.normalize("NFC").replace(POSSESSIVE, "");
  return [...plain.matchAll(TOKEN)].map((m) => ({
    word: stem(m[0].toLowerCase()),
    name: /\p{Lu}/u.test(m[0]),
  }));
}

function readHeadline(title: string): Headline {
  const body = tokens(title.replace(TRAILING_SOURCE, ""));
  return {
    words: new Set(tokens(title).map((t) => t.word)),
    content: new Set(
      body.filter((t) => !STOPWORDS.has(t.word)).map((t) => t.word)
    ),
    names: [...new Set(body.filter((t) => t.name).map((t) => t.word))],
  };
}

/** Whether the clause names the headline's names in the headline's order,
 *  each by its first mention. */
function keepsNameOrder(names: string[], own: Token[]): boolean {
  const mentioned = [...new Set(own.filter((t) => t.name).map((t) => t.word))];
  const order = mentioned
    .map((word) => names.indexOf(word))
    .filter((at) => at !== -1);
  return order.every((at, i) => i === 0 || at > (order[i - 1] ?? -1));
}

function restates(headline: Headline, clause: string): boolean {
  const content = tokens(clause).filter((t) => !STOPWORDS.has(t.word));
  if (content.length === 0 || headline.content.size === 0) return false;
  if (content.some((t) => !headline.words.has(t.word))) return false;
  const mine = new Set(content.map((t) => t.word));
  const repeated = [...headline.content].filter((w) => mine.has(w)).length;
  if (repeated / headline.content.size < RESTATED_TITLE_SHARE) return false;
  return keepsNameOrder(headline.names, content);
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
 * split into clauses at a spaced dash. A clause is dropped only when every
 * content word in it is already in the headline, it repeats most of the
 * headline, and it names the headline's names in the same order ("Microsoft
 * sues OpenAI" is not "OpenAI sues Microsoft"). The first clause that is
 * kept stays with everything after it.
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
