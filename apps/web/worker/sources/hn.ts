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

/**
 * Config (all optional):
 * - `query`: Algolia full-text query for the newest-first search.
 * - `popularMinPoints`: adds a third search, most-relevant first, restricted
 *   to stories at or above this score inside the same window. It catches
 *   high-scoring AI stories that fell outside both the newest-100 and the
 *   front page. Absent = the original two searches only.
 */
export const hnAdapter: SourceAdapter = {
  type: "hn",

  async fetchItems(config, sinceEpochSec) {
    const query = typeof config.query === "string" ? config.query : "";
    const numericFilters = `created_at_i>${sinceEpochSec}`;

    const byDateUrl = new URL("https://hn.algolia.com/api/v1/search_by_date");
    byDateUrl.searchParams.set("tags", "story");
    if (query) byDateUrl.searchParams.set("query", query);
    byDateUrl.searchParams.set("numericFilters", numericFilters);
    byDateUrl.searchParams.set("hitsPerPage", "100");

    const frontPageUrl = new URL("https://hn.algolia.com/api/v1/search");
    frontPageUrl.searchParams.set("tags", "front_page");
    frontPageUrl.searchParams.set("numericFilters", numericFilters);
    frontPageUrl.searchParams.set("hitsPerPage", "100");

    const searches = [
      search(byDateUrl.toString()),
      search(frontPageUrl.toString()),
    ];
    const minPoints = config.popularMinPoints;
    if (typeof minPoints === "number" && Number.isFinite(minPoints)) {
      const popularUrl = new URL("https://hn.algolia.com/api/v1/search");
      popularUrl.searchParams.set("tags", "story");
      if (query) popularUrl.searchParams.set("query", query);
      popularUrl.searchParams.set(
        "numericFilters",
        `${numericFilters},points>=${Math.max(1, Math.floor(minPoints))}`
      );
      popularUrl.searchParams.set("hitsPerPage", "100");
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
