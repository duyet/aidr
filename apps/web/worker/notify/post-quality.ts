/**
 * What a channel may post: a story whose copy is fit to read, and an event
 * the channel has not already covered. Pure; `posted-events.ts` loads the
 * history these functions compare against.
 */

import {
  articleId,
  evidenceTokens,
  foldDiacritics,
  significantTitleTokens,
} from "../dedupe.js";
import {
  extractProtectedTerms,
  hasSourceChrome,
} from "../translation-terms.js";

/** A summary shorter than this is a stub ("From Bloomberg.") or a bare
 *  teaser: a post of title plus one clause reads as a headline repost. */
export const MIN_SUMMARY_CHARS = 80;

/** Token Jaccard of two source titles at or above which they name one event,
 *  given a shared entity. Tuned on the 2026-10-08..11 audit: the same event
 *  from two outlets scored 0.21 (Nvidia/Reflection) and 0.35 (TypeSafe),
 *  while different stories sharing an entity scored 0.03 to 0.10. */
export const EVENT_TITLE_JACCARD = 0.2;

/** Named entities both titles must mention. One shared name is not enough:
 *  "Nvidia signs AI chip deal with Saudi Arabia's Humain" and "Nvidia
 *  Negotiates $25B Reflection AI Deal" share Nvidia, AI and "deal" and clear
 *  the ratio, yet are different deals. */
export const EVENT_MIN_SHARED_NAMES = 2;

/** Shared title tokens a pair needs besides the ratio. Two short headlines
 *  about one company ("Nvidia launches Rubin GPU", "Nvidia stock falls on
 *  Rubin delay") clear 0.2 on two tokens; real rewrites share three or more. */
export const EVENT_MIN_SHARED_TOKENS = 3;

export type GateReason = "chrome" | "short" | "missing";

export type Postability = { ok: true } | { ok: false; reason: GateReason };

/** Whether this copy is worth a post of its own. `summary` is the channel's
 *  own-language summary, the text that would be sent. Page chrome is checked
 *  first: a summary that is only chrome is also short, and chrome is the
 *  cause worth reporting. */
export function postability(story: {
  title: string;
  summary: string | null | undefined;
}): Postability {
  const summary = story.summary?.replace(/\s+/g, " ").trim() ?? "";
  if (!summary) return { ok: false, reason: "missing" };
  if (hasSourceChrome(summary)) return { ok: false, reason: "chrome" };
  if (summary.length < MIN_SUMMARY_CHARS) return { ok: false, reason: "short" };
  return { ok: true };
}

/** Companies and labs whose names are not capitalized any differently from
 *  ordinary words in a Title Case headline, so the name extractor cannot
 *  tell "Nvidia" from "Raises". Lowercase. */
const KNOWN_ORGS = new Set([
  "amazon",
  "amd",
  "anthropic",
  "apple",
  "arm",
  "bytedance",
  "cerebras",
  "cloudflare",
  "cohere",
  "coreweave",
  "databricks",
  "deepmind",
  "deepseek",
  "google",
  "huawei",
  "intel",
  "meta",
  "microsoft",
  "mistral",
  "moonshot",
  "nvidia",
  "openai",
  "oracle",
  "perplexity",
  "qualcomm",
  "samsung",
  "sequoia",
  "stability",
  "tencent",
  "tesla",
  "tsmc",
  "xai",
]);

/** Names every AI headline carries; sharing one says nothing about the event. */
const GENERIC_ENTITIES = new Set([
  "ai",
  "api",
  "ceo",
  "cpu",
  "eu",
  "gpu",
  "llm",
  "ml",
  "sdk",
  "uk",
  "us",
]);

/** The source fields of a story, besides its title, that key its event. */
export interface EventSource {
  url: string | null;
  /** The `source_lang` column; only an explicit `vi` is Vietnamese. */
  sourceLang: string | null;
}

export interface EventKey {
  /** The story's source title in NFC, the same text on both sides of a
   *  compare. */
  title: string;
  vietnamese: boolean;
  /** The publisher's article id (`articleId`), shared by an article and its
   *  live page. */
  article: string | null;
  /** Lowercase named entities: org names, products, acronyms, and the
   *  capitalized words of a Vietnamese title. */
  entities: readonly string[];
  /** The lowercase text names are looked up in, and where each of its words
   *  starts. */
  nameText: string;
  wordStarts: ReadonlyMap<string, readonly number[]>;
}

const WORD = /[\p{L}\p{N}]+/gu;
const LEADING_WORD = /^[\p{L}\p{N}]+/u;
const WORD_CHAR_AT = /[\p{L}\p{N}]/uy;

/** A Vietnamese headline capitalizes only names ("Trần Trung Tính", "Nobel
 *  Vật lý"), so each capitalized word after a sentence's first is one.
 *  `extractProtectedTerms` reads English: it cut "Việt Nam" into "vi" and
 *  "nam", and "vi" then matched inside every "việt" (#756). */
function vietnameseNames(title: string): string[] {
  return title
    .split(/(?<=[.!?:;])\s+/)
    .flatMap((sentence) => (sentence.match(WORD) ?? []).slice(1))
    .filter((word) => /^\p{Lu}/u.test(word));
}

/** The source language picks the rules, not a diacritic: "Société Générale"
 *  carries Vietnamese-range accents (#766). An English title's names are read
 *  and matched with diacritics folded, because `extractProtectedTerms` reads
 *  ASCII and cut "Société" to "soci". A Vietnamese title keeps its marks:
 *  folded, the "Nam" of Việt Nam would match every "năm". NFC first, since a
 *  decomposed "ệ" is "e" plus a mark and splits the word. */
export function eventKey(rawTitle: string, source: EventSource): EventKey {
  const title = rawTitle.normalize("NFC");
  const vietnamese = source.sourceLang === "vi";
  const nameText = vietnamese
    ? title.toLowerCase()
    : foldDiacritics(title.toLowerCase());
  const wordStarts = new Map<string, number[]>();
  for (const match of nameText.matchAll(WORD)) {
    const starts = wordStarts.get(match[0]);
    if (starts) starts.push(match.index);
    else wordStarts.set(match[0], [match.index]);
  }
  const entities = new Set<string>();
  const names = vietnamese
    ? vietnameseNames(title)
    : extractProtectedTerms({ title: foldDiacritics(title), summary: "" })
        .names;
  for (const name of names) {
    entities.add(name.replace(/['’]s$/i, "").toLowerCase());
  }
  for (const word of wordStarts.keys()) {
    if (KNOWN_ORGS.has(word)) entities.add(word);
  }
  for (const generic of GENERIC_ENTITIES) entities.delete(generic);
  return {
    title,
    vietnamese,
    article: source.url ? articleId(source.url) : null,
    entities: [...entities],
    nameText,
    wordStarts,
  };
}

/** `entity` as a whole word or run of words of the key's title. A Vietnamese
 *  letter is part of the word, so "vi" is not in "việt". Only the places
 *  where the name's first word starts are checked, so a pair costs time in
 *  proportion to its names, not names times title length (#766). */
function mentions(key: EventKey, entity: string): boolean {
  const name = key.vietnamese ? entity : foldDiacritics(entity);
  const first = LEADING_WORD.exec(name)?.[0];
  if (!first) return false;
  return (key.wordStarts.get(first) ?? []).some((start) => {
    if (!key.nameText.startsWith(name, start)) return false;
    WORD_CHAR_AT.lastIndex = start + name.length;
    return !WORD_CHAR_AT.test(key.nameText);
  });
}

/** Two keys name one event: similar titles that both mention at least
 *  `EVENT_MIN_SHARED_NAMES` of the same named entities. A name found in either
 *  title counts once the other title contains it, so "Reflection" (a name in
 *  the sentence-case headline) is shared with the Title Case rewrite where the
 *  extractor cannot tell it from a common word. The name requirement keeps a
 *  generic headline pair ("raises $500M for its agent") from matching on
 *  filler words alone.
 *
 *  Two Vietnamese titles compare words (`evidenceTokens`), not syllables.
 *  In syllables, headlines on one Nobel prize scored 0.18 and different
 *  stories sharing "Việt Nam" and "công nghệ" 0.21 to 0.25; in words the
 *  first score 0.21 to 0.40 and the second 0 to 0.07 (#756).
 *
 *  One publisher article id is one event whatever the titles say: a
 *  vnexpress live page shares its article's id but rarely its headline
 *  words (#765). */
export function sameEvent(a: EventKey, b: EventKey): boolean {
  if (a.article !== null && a.article === b.article) return true;
  const names = new Set([...a.entities, ...b.entities]);
  let sharedNames = 0;
  for (const name of names) {
    if (mentions(a, name) && mentions(b, name)) sharedNames++;
  }
  if (sharedNames < EVENT_MIN_SHARED_NAMES) return false;
  const words =
    a.vietnamese && b.vietnamese ? evidenceTokens : significantTitleTokens;
  const ta = words(a.title);
  const tb = words(b.title);
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  if (shared < EVENT_MIN_SHARED_TOKENS) return false;
  return shared / (ta.size + tb.size - shared) >= EVENT_TITLE_JACCARD;
}

export type PostedKind = "digest" | "trending";

/** One story a channel has already put in front of its readers. */
export interface PostedEvent {
  /** The notifier id (`telegram`, `telegram-en`, `facebook-en`). */
  channelGroup: string;
  itemId: string;
  /** The story's `duplicate_of` root, or its own id when it is the root. */
  canonicalId: string;
  eventKey: EventKey;
  postedAt: number;
  kind: PostedKind;
}

export interface TrendingCandidate {
  itemId: string;
  canonicalId: string;
  eventKey: EventKey;
}

export type DedupReason = "canonical" | "event";

/** Why this candidate repeats something already posted, or null when it is
 *  new. A shared canonical id is the exact signal; the event key catches the
 *  same event reported by another outlet, which the merge step missed.
 *
 *  A repost for a material update (a changed number, a new development) is
 *  not allowed in v1. Telling an update from a rewrite needs more than a
 *  title compare, and a wrong "update" is a duplicate post. */
export function dedupReason(
  candidate: TrendingCandidate,
  posted: readonly PostedEvent[]
): DedupReason | null {
  if (posted.some((p) => p.canonicalId === candidate.canonicalId)) {
    return "canonical";
  }
  if (posted.some((p) => sameEvent(candidate.eventKey, p.eventKey))) {
    return "event";
  }
  return null;
}

export type SuppressionReason = `dedup:${DedupReason}` | `gate:${GateReason}`;

/** Per-reason counts of the candidates a run dropped before sending. */
export type SuppressionCounts = Partial<Record<SuppressionReason, number>>;

export function countSuppression(
  counts: SuppressionCounts,
  reason: SuppressionReason
): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}
