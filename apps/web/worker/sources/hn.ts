import { AI_KEYWORD_RE } from "./keywords.js";
import { SourceFetchError } from "./rss.js";
import type { FetchedItem, SourceAdapter } from "./types.js";

interface AlgoliaHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  created_at_i: number;
  points?: number;
  num_comments?: number;
  author?: string;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
}

function hitToItem(hit: AlgoliaHit): FetchedItem | null {
  const title = hit.title ?? hit.story_title;
  const url = hit.url ?? hit.story_url;
  if (!title || !url) return null;
  return {
    externalId: hit.objectID,
    url,
    title,
    publishedAt: hit.created_at_i * 1000,
    points: hit.points ?? 0,
    comments: hit.num_comments ?? 0,
    sources: [
      {
        kind: "discussion",
        author: hit.author,
        postedAt: hit.created_at_i,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      },
    ],
  };
}

async function search(url: string): Promise<AlgoliaHit[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new SourceFetchError(
      "fetch_failed",
      `hn search returned ${res.status}`
    );
  }
  const data = (await res.json()) as AlgoliaResponse;
  return data.hits ?? [];
}

/** Algolia's largest page. A 26h window can hold more than 100 stories at
 *  the points floor, and a shorter page drops whichever ranked last. */
const POPULAR_HITS_PER_PAGE = 1000;

/**
 * The front page, plus with `popularMinPoints` every story at or above that
 * score in the window, deduped, then kept only when the title passes
 * `AI_KEYWORD_RE`. No search sends an Algolia `query`: HN Algolia requires
 * every query word, so `AI OR LLM` required the word `OR` and matched
 * nothing (#873), and a fixed keyword list misses titles the regex accepts.
 * There is no newest-first search: unfloored, it returns about 250 AI posts
 * a day, most under 5 points.
 */
export const hnAdapter: SourceAdapter = {
  type: "hn",

  async fetchItems(config, sinceEpochSec) {
    const numericFilters = `created_at_i>${sinceEpochSec}`;

    const frontPageUrl = new URL("https://hn.algolia.com/api/v1/search");
    frontPageUrl.searchParams.set("tags", "front_page");
    frontPageUrl.searchParams.set("numericFilters", numericFilters);
    frontPageUrl.searchParams.set("hitsPerPage", "100");

    const searches = [search(frontPageUrl.toString())];
    const minPoints = config.popularMinPoints;
    if (typeof minPoints === "number" && Number.isFinite(minPoints)) {
      const popularUrl = new URL("https://hn.algolia.com/api/v1/search");
      popularUrl.searchParams.set("tags", "story");
      popularUrl.searchParams.set(
        "numericFilters",
        `${numericFilters},points>=${Math.max(1, Math.floor(minPoints))}`
      );
      popularUrl.searchParams.set("hitsPerPage", String(POPULAR_HITS_PER_PAGE));
      searches.push(search(popularUrl.toString()));
    }
    const results = await Promise.all(searches);

    const seen = new Map<string, AlgoliaHit>();
    for (const hit of results.flat()) {
      if (!seen.has(hit.objectID)) seen.set(hit.objectID, hit);
    }

    const items: FetchedItem[] = [];
    for (const hit of seen.values()) {
      const item = hitToItem(hit);
      if (!item) continue;
      if (!AI_KEYWORD_RE.test(item.title)) continue;
      items.push(item);
    }
    return items;
  },
};
