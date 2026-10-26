/**
 * Freshness + trending check for top stories (shadow mode, see ALGORITHM.md
 * "Freshness check"). Pure: the HTTP providers live in `providers.ts` and are
 * injected, so the eval script and the Worker step share one judge.
 */

export type FreshnessVerdict =
  | "fresh"
  | "stale"
  | "superseded"
  | "old_resurfaced"
  | "unknown";

/** One story as the checker sees it. Times are epoch seconds. */
export interface FreshnessStory {
  id: string;
  title: string;
  url: string;
  publishedAt: number;
  /** Other URLs the pipeline already holds for this story (merged sources). */
  sourceUrls: { url: string; postedAt: number | null }[];
}

/** One search result from any provider. */
export interface SearchHit {
  url: string;
  title: string;
  /** Outlet domain as the provider names it (Google News `<source url>`). */
  domain: string;
  publishedAt: number | null;
  provider: string;
}

export interface FreshnessProviders {
  /** Returns the article's own published date (epoch seconds) or null. */
  articleDate: (url: string) => Promise<number | null>;
  search: { name: string; run: (query: string) => Promise<SearchHit[]> }[];
}

export interface FreshnessResult {
  id: string;
  verdict: FreshnessVerdict;
  /** Distinct outlets (syndication collapsed) covering it in the window. */
  trendingSources: number;
  domains: string[];
  articlePublishedAt: number | null;
  /** Newer related hits that carry a follow-up cue (correction, delay...). */
  newerUrls: string[];
  evidenceUrls: string[];
  latencyMs: number;
  errors: string[];
}

const HOUR = 3600;
const DAY = 24 * HOUR;
export const TRENDING_WINDOW_S = 2 * DAY;
/** An article whose own date is this much older than our publish time is a
 * resurfaced old story. */
export const RESURFACED_GAP_S = 7 * DAY;
/** With no coverage in the window, a story this old is stale. */
export const STALE_AGE_S = 3 * DAY;

const FOLLOW_UP_CUE =
  /\b(correct(?:s|ed|ion)|retract(?:s|ed|ion)?|den(?:y|ies|ied)|delay(?:s|ed)?|revers(?:e|es|ed)|walk(?:s|ed)? back|pull(?:s|ed)|scrap(?:s|ped)|cancel(?:s|led|ed)?|postpone[sd]?|halt(?:s|ed)?|backtrack(?:s|ed)?|recall(?:s|ed)?|reverses course|u-turn)\b/i;

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was will with after over new says said plans launch launches update its their than more up out about via how why what who".split(
    " "
  )
);

/** Outlets that only aggregate or repost; never counted as coverage. */
const AGGREGATORS = new Set([
  "techmeme.com",
  "x.com",
  "twitter.com",
  "google.com",
  "ycombinator.com",
  "reddit.com",
  "aidr.today",
]);

/** Drops a trailing "(Author/Outlet)" credit and the " - Outlet" suffix. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\/[^)]*\)\s*$/, "")
    .replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, "")
    .trim();
}

export function keyTerms(title: string): string[] {
  const seen = new Set<string>();
  for (const raw of cleanTitle(title)
    .toLowerCase()
    .split(/[^\p{L}\p{N}$.+-]+/u)) {
    const word = raw.replace(/^[.+-]+|[.+-]+$/g, "");
    if (word.length < 2 || STOP.has(word)) continue;
    seen.add(word);
  }
  return [...seen];
}

/** Search query: the first salient terms, capped so engines stay precise. */
export function searchQuery(title: string, max = 6): string {
  return keyTerms(title).slice(0, max).join(" ");
}

/** Share of the story's first six key terms present in a hit title. */
export function overlap(storyTerms: string[], hitTitle: string): number {
  const terms = storyTerms.slice(0, 6);
  if (terms.length === 0) return 0;
  const hit = new Set(keyTerms(hitTitle));
  return terms.filter((t) => hit.has(t)).length / terms.length;
}

/** Registrable-ish domain: last two labels, three for `co.uk`-style. */
export function siteOf(urlOrHost: string): string {
  let host = urlOrHost;
  try {
    host = new URL(urlOrHost).hostname;
  } catch {
    // already a host
  }
  const labels = host
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".");
  const n = labels.length >= 3 && labels.at(-2)!.length <= 3 ? 3 : 2;
  return labels.slice(-n).join(".");
}

/** Syndication networks post one article on many sites with the same path
 * slug; key those by slug so they count once. */
function outletKey(url: string, domain: string): string {
  try {
    const slug = new URL(url).pathname.match(/-([0-9a-f]{8})\/?$/);
    if (slug) return `slug:${slug[1]}`;
  } catch {
    // not a URL
  }
  return domain;
}

export const MIN_OVERLAP = 0.5;

export function judgeFreshness(
  story: FreshnessStory,
  articlePublishedAt: number | null,
  hits: SearchHit[],
  nowS: number
): Omit<FreshnessResult, "latencyMs" | "errors"> {
  const terms = keyTerms(story.title);
  const related = hits.filter(
    (h) => overlap(terms, h.title) >= MIN_OVERLAP && h.url !== story.url
  );
  const windowStart = nowS - TRENDING_WINDOW_S;
  const outlets = new Map<string, string>();
  const add = (url: string, domain: string) => {
    if (AGGREGATORS.has(domain)) return;
    const key = outletKey(url, domain);
    if (!outlets.has(key)) outlets.set(key, domain);
  };
  add(story.url, siteOf(story.url));
  for (const s of story.sourceUrls)
    if (s.postedAt === null || s.postedAt >= windowStart)
      add(s.url, siteOf(s.url));
  for (const h of related)
    if (h.publishedAt !== null && h.publishedAt >= windowStart)
      add(h.url, h.domain);

  const newer = related.filter(
    (h) =>
      h.publishedAt !== null &&
      h.publishedAt > story.publishedAt + HOUR &&
      FOLLOW_UP_CUE.test(h.title) &&
      !FOLLOW_UP_CUE.test(story.title)
  );

  let verdict: FreshnessVerdict;
  if (
    articlePublishedAt !== null &&
    story.publishedAt - articlePublishedAt > RESURFACED_GAP_S
  ) {
    verdict = "old_resurfaced";
  } else if (newer.length > 0) {
    verdict = "superseded";
  } else if (
    nowS - (articlePublishedAt ?? story.publishedAt) > STALE_AGE_S &&
    !related.some((h) => h.publishedAt !== null && h.publishedAt >= windowStart)
  ) {
    verdict = "stale";
  } else {
    verdict = "fresh";
  }

  return {
    id: story.id,
    verdict,
    trendingSources: outlets.size,
    domains: [...new Set(outlets.values())],
    articlePublishedAt,
    newerUrls: newer.map((h) => h.url),
    evidenceUrls: related.slice(0, 8).map((h) => h.url),
  };
}

/** URLs worth reading for the article's own date: the story URL unless it
 * is an aggregator page, then merged sources that are not aggregators. */
export function dateCandidates(story: FreshnessStory, max = 2): string[] {
  const urls = [story.url, ...story.sourceUrls.map((s) => s.url)];
  return [...new Set(urls)]
    .filter((u) => !AGGREGATORS.has(siteOf(u)))
    .slice(0, max);
}

/** Runs every provider; a provider error is recorded, never thrown. */
export async function checkFreshness(
  story: FreshnessStory,
  providers: FreshnessProviders,
  nowS: number
): Promise<FreshnessResult> {
  const started = Date.now();
  const errors: string[] = [];
  let searchFailures = 0;
  const query = searchQuery(story.title);
  const [articlePublishedAt, ...searches] = await Promise.all([
    (async () => {
      for (const url of dateCandidates(story)) {
        try {
          const date = await providers.articleDate(url);
          if (date !== null) return date;
        } catch (error) {
          errors.push(`article ${siteOf(url)}: ${errorText(error)}`);
        }
      }
      return null;
    })(),
    ...providers.search.map(async (p) => {
      try {
        return await p.run(query);
      } catch (error) {
        errors.push(`${p.name}: ${errorText(error)}`);
        searchFailures += 1;
        return [];
      }
    }),
  ]);
  const judged = judgeFreshness(
    story,
    articlePublishedAt,
    searches.flat(),
    nowS
  );
  const blind =
    articlePublishedAt === null &&
    providers.search.length > 0 &&
    searchFailures === providers.search.length;
  return {
    ...judged,
    verdict: blind ? "unknown" : judged.verdict,
    latencyMs: Date.now() - started,
    errors,
  };
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 120);
}
