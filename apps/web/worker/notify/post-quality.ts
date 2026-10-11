/**
 * What a channel may post: a story whose copy is fit to read, and an event
 * the channel has not already covered. Pure; `posted-events.ts` loads the
 * history these functions compare against.
 */

import { significantTitleTokens } from "../dedupe.js";
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

export interface EventKey {
  /** The story's source title, the same text on both sides of a compare. */
  title: string;
  /** Lowercase named entities: org names, products, acronyms. */
  entities: readonly string[];
}

export function eventKey(title: string): EventKey {
  const entities = new Set<string>();
  for (const name of extractProtectedTerms({ title, summary: "" }).names) {
    entities.add(name.replace(/['’]s$/i, "").toLowerCase());
  }
  for (const token of title.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (KNOWN_ORGS.has(token)) entities.add(token);
  }
  for (const generic of GENERIC_ENTITIES) entities.delete(generic);
  return { title, entities: [...entities] };
}

function mentions(title: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(
    title.toLowerCase()
  );
}

/** Two keys name one event: similar titles that both mention at least
 *  `EVENT_MIN_SHARED_NAMES` of the same named entities. A name found in either
 *  title counts once the other title contains it, so "Reflection" (a name in
 *  the sentence-case headline) is shared with the Title Case rewrite where the
 *  extractor cannot tell it from a common word. The name requirement keeps a
 *  generic headline pair ("raises $500M for its agent") from matching on
 *  filler words alone. */
export function sameEvent(a: EventKey, b: EventKey): boolean {
  const names = new Set([...a.entities, ...b.entities]);
  let sharedNames = 0;
  for (const name of names) {
    if (mentions(a.title, name) && mentions(b.title, name)) sharedNames++;
  }
  if (sharedNames < EVENT_MIN_SHARED_NAMES) return false;
  const ta = significantTitleTokens(a.title);
  const tb = significantTitleTokens(b.title);
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
