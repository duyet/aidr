/**
 * Whether a restored story is already live as another row. A story the wrong
 * merge hid can have a published copy: the aggregator twin that arrived
 * after it (ingest only clusters against published rows), or the same
 * article under a second URL. Publishing the restored row would show the
 * story twice.
 *
 * `sameStoryRule` is identity: one URL, one aggregator slug hash, one
 * source article id, or the dedupe pass's exact-title rule. The unmerge
 * re-points such a row to the live one. `isLikelySameEvent` is the title
 * pass's near-duplicate rule, which is similarity, not identity, so the
 * unmerge holds the row for a human decision.
 */
import {
  isTitleNearDuplicate,
  normalizeTitleForDedupe,
  significantTitleTokens,
} from "../dedupe.js";
import { MERGE_LOOKBACK_SEC } from "../ingest/context.js";
import { canonicalizeMediaUrl } from "../media.js";

/** The `items` columns that say which story a row is. */
export interface StoryRef {
  id: string;
  source_id: string;
  url: string;
  title: string;
  published_at: number;
}

export type TwinRule = "url" | "aggregator-slug" | "article-id" | "exact-title";

/** huggingnews and marketbrief publish one story under one slug, ending in
 * the same 8-hex hash on both sites. */
const AGGREGATOR_SLUG =
  /^https?:\/\/(?:www\.)?(?:huggingnews\.com|marketbrief\.now)\/.*-([0-9a-f]{8})\/?$/i;

export function aggregatorSlugHash(url: string): string | null {
  return AGGREGATOR_SLUG.exec(url)?.[1]?.toLowerCase() ?? null;
}

/** Sites whose URL ends in the article's numeric id, so one article under
 * two slugs (an edited headline) is still one id. */
const ARTICLE_ID_PATTERNS: readonly { host: RegExp; id: RegExp }[] = [
  { host: /(?:^|\.)vnexpress\.net$/i, id: /-(\d{6,})\.html$/i },
];

function articleId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const { host, id } of ARTICLE_ID_PATTERNS) {
    const match = host.test(parsed.hostname) ? id.exec(parsed.pathname) : null;
    if (match) return `${parsed.hostname.replace(/^www\./, "")}:${match[1]}`;
  }
  return null;
}

/** A ref's identity keys, computed once: a plan compares each paired row
 * with about 2,000 published rows. */
interface StoryKeys {
  url: string;
  slug: string | null;
  article: string | null;
  title: string;
  tokens: Set<string>;
}

const keyCache = new WeakMap<StoryRef, StoryKeys>();

function keysOf(ref: StoryRef): StoryKeys {
  let keys = keyCache.get(ref);
  if (!keys) {
    keys = {
      url: canonicalizeMediaUrl(ref.url) ?? ref.url,
      slug: aggregatorSlugHash(ref.url),
      article: articleId(ref.url),
      title: normalizeTitleForDedupe(ref.title),
      tokens: significantTitleTokens(ref.title),
    };
    keyCache.set(ref, keys);
  }
  return keys;
}

const withinLookback = (a: StoryRef, b: StoryRef) =>
  Math.abs(a.published_at - b.published_at) <= MERGE_LOOKBACK_SEC;

/** Why `a` and `b` are one story, or null. Exact titles count only across
 * sources: one feed reuses a title for a new post ("AINews: not much
 * happened today"). */
export function sameStoryRule(a: StoryRef, b: StoryRef): TwinRule | null {
  const ka = keysOf(a);
  const kb = keysOf(b);
  if (ka.url === kb.url) return "url";
  if (ka.slug !== null && ka.slug === kb.slug) return "aggregator-slug";
  if (ka.article !== null && ka.article === kb.article) return "article-id";
  if (
    ka.title !== "" &&
    ka.title === kb.title &&
    a.source_id !== b.source_id &&
    withinLookback(a, b)
  ) {
    return "exact-title";
  }
  return null;
}

/** The title pass's near-duplicate rule inside the merge lookback ("Reddit
 * is killing RSS feeds…" and "Reddit Ends RSS…"). Three shared tokens alone
 * flagged 30 of the #728 pairs, mostly unrelated stories that share "AI",
 * "data center" or Vietnamese syllables. */
export function isLikelySameEvent(a: StoryRef, b: StoryRef): boolean {
  if (!withinLookback(a, b)) return false;
  const ka = keysOf(a);
  const kb = keysOf(b);
  if (ka.title !== "" && ka.title === kb.title) return true;
  // `isTitleNearDuplicate` needs two shared significant tokens beyond an
  // exact match; most pairs share fewer, so skip its re-tokenizing.
  let shared = 0;
  for (const token of ka.tokens) if (kb.tokens.has(token)) shared++;
  return shared >= 2 && isTitleNearDuplicate(a.title, b.title);
}

export interface TwinMatch {
  ref: StoryRef;
  /** Null for a likely-same-event match. */
  rule: TwinRule | null;
}

/** Every candidate that is the same story as any of `rows`, or likely the
 * same event, one entry per candidate. Identity wins over similarity. */
export function twinMatches(
  rows: readonly StoryRef[],
  candidates: readonly StoryRef[]
): TwinMatch[] {
  const own = new Set(rows.map((row) => row.id));
  const out: TwinMatch[] = [];
  for (const ref of candidates) {
    if (own.has(ref.id)) continue;
    const rule =
      rows.map((row) => sameStoryRule(row, ref)).find((r) => r !== null) ??
      null;
    if (rule !== null || rows.some((row) => isLikelySameEvent(row, ref))) {
      out.push({ ref, rule });
    }
  }
  return out;
}
