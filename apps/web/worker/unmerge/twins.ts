/**
 * Whether a restored story is already live as another row. A story the wrong
 * merge hid can have a published copy: the aggregator twin that arrived
 * after it (ingest only clusters against published rows), the same article
 * under a second URL, or a row merged into a published story (its slug twin
 * or another source's copy).
 * Publishing the restored row would show the story twice.
 *
 * `sameStoryRule` is identity: one URL, one aggregator slug hash, one
 * source article id, or the dedupe pass's exact-title rule. The unmerge
 * re-points such a row to the live story. `isLikelySameEvent` is the title
 * pass's near-duplicate rule, which is similarity, not identity, so the
 * unmerge holds the row for a human decision.
 */
import {
  articleId,
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
  source_lang: string | null;
  /** A Vietnamese row's vi->en title (`translations`, lang `en`), null
   * until it is written. Unused for an English row. */
  title_en: string | null;
}

/** A row a restored story can be live as: a published row, whose `root` is
 * its own id, or a row merged into one, whose `duplicate_of` chain ends at
 * the published `root`. */
export interface LiveRef extends StoryRef {
  root: string;
}

export type TwinRule = "url" | "aggregator-slug" | "article-id" | "exact-title";

/** huggingnews and marketbrief publish one story under one slug, ending in
 * the same 8-hex hash on both sites. */
const AGGREGATOR_SLUG =
  /^https?:\/\/(?:www\.)?(?:huggingnews\.com|marketbrief\.now)\/.*-([0-9a-f]{8})\/?$/i;

export function aggregatorSlugHash(url: string): string | null {
  return AGGREGATOR_SLUG.exec(url)?.[1]?.toLowerCase() ?? null;
}

/** One article's URL whatever the link form: no scheme, `www.`, fragment,
 * tracking keys or trailing slash (openai's feed links `/index/<slug>/`,
 * HN the same page without the slash). The query and path case stay: HN's
 * `item?id=` is the page. */
export function storyUrlKey(url: string): string {
  const canonical = canonicalizeMediaUrl(url);
  if (!canonical) return url;
  const parsed = new URL(canonical);
  const host = parsed.hostname.replace(/^www\./, "");
  return `${host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
}

const isVietnamese = (ref: StoryRef) => ref.source_lang === "vi";

interface TitleKey {
  raw: string;
  normalized: string;
  tokens: Set<string>;
}

function titleKey(raw: string): TitleKey {
  return {
    raw,
    normalized: normalizeTitleForDedupe(raw),
    tokens: significantTitleTokens(raw),
  };
}

/** A ref's identity keys, computed once: a plan compares each paired row
 * with a few thousand live rows. */
interface StoryKeys {
  url: string;
  slug: string | null;
  article: string | null;
  title: TitleKey;
  /** The title in English: the source title of an English row, the stored
   * translation of a Vietnamese one, null while it has none. */
  english: TitleKey | null;
}

const keyCache = new WeakMap<StoryRef, StoryKeys>();

function keysOf(ref: StoryRef): StoryKeys {
  let keys = keyCache.get(ref);
  if (!keys) {
    const title = titleKey(ref.title);
    const english = ref.title_en?.trim();
    keys = {
      url: storyUrlKey(ref.url),
      slug: aggregatorSlugHash(ref.url),
      article: articleId(ref.url),
      title,
      english: !isVietnamese(ref) ? title : english ? titleKey(english) : null,
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
    ka.title.normalized !== "" &&
    ka.title.normalized === kb.title.normalized &&
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
 * "data center" or Vietnamese syllables.
 *
 * A Vietnamese and an English row compare in English, through the stored
 * translation, as the trending guard does (#786): the only tokens their
 * source titles share are Latin names. The translation is model output, so
 * it only ever makes this similarity match, never identity. */
export function isLikelySameEvent(a: StoryRef, b: StoryRef): boolean {
  if (!withinLookback(a, b)) return false;
  const ka = keysOf(a);
  const kb = keysOf(b);
  const [ta, tb] =
    isVietnamese(a) === isVietnamese(b)
      ? [ka.title, kb.title]
      : [ka.english, kb.english];
  if (!ta || !tb) return false;
  if (ta.normalized !== "" && ta.normalized === tb.normalized) return true;
  // `isTitleNearDuplicate` needs two shared significant tokens beyond an
  // exact match; most pairs share fewer, so skip its re-tokenizing.
  let shared = 0;
  for (const token of ta.tokens) if (tb.tokens.has(token)) shared++;
  return shared >= 2 && isTitleNearDuplicate(ta.raw, tb.raw);
}

export interface TwinMatch<T extends StoryRef = StoryRef> {
  ref: T;
  /** Null for a likely-same-event match. */
  rule: TwinRule | null;
}

/** Every candidate that is the same story as any of `rows`, or likely the
 * same event, one entry per candidate. Identity wins over similarity. */
export function twinMatches<T extends StoryRef>(
  rows: readonly StoryRef[],
  candidates: readonly T[]
): TwinMatch<T>[] {
  const own = new Set(rows.map((row) => row.id));
  const out: TwinMatch<T>[] = [];
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
