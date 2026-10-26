/**
 * HTTP providers for the freshness check. Each call has its own timeout and
 * a size cap; callers (`checkFreshness`) record failures instead of
 * throwing.
 */
import { type SearchHit, siteOf, TRENDING_WINDOW_S } from "./check.js";

export const PROVIDER_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 400_000;
const UA = "aidr-freshness/1.0 (+https://aidr.today)";

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`HTTP ${res.status}`);
  }
  return res;
}

async function cappedText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

const DATE_PATTERNS = [
  /"datePublished"\s*:\s*"([^"]+)"/i,
  /<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|pubdate|publish-date|date)["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']article:published_time["']/i,
  /<time[^>]+itemprop=["']datePublished["'][^>]*datetime=["']([^"']+)["']/i,
];

/** The article's own published date from JSON-LD or meta tags. */
export function parseArticleDate(html: string): number | null {
  for (const pattern of DATE_PATTERNS) {
    const raw = html.match(pattern)?.[1];
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

export async function fetchArticleDate(url: string): Promise<number | null> {
  return parseArticleDate(await cappedText(await get(url)));
}

/** HN Algolia, public and keyless: stories in the trending window. */
export async function searchHackerNews(
  query: string,
  nowS = Math.floor(Date.now() / 1000)
): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    query,
    tags: "story",
    hitsPerPage: "20",
    numericFilters: `created_at_i>${nowS - TRENDING_WINDOW_S}`,
  });
  const res = await get(`https://hn.algolia.com/api/v1/search?${params}`);
  const body = (await res.json()) as {
    hits?: { url?: string | null; title?: string; created_at_i?: number }[];
  };
  return (body.hits ?? [])
    .filter((h) => h.url && h.title)
    .map((h) => ({
      url: h.url as string,
      title: h.title as string,
      domain: siteOf(h.url as string),
      publishedAt: h.created_at_i ?? null,
      provider: "hn",
    }));
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** Parses a Google News RSS search feed. */
export function parseGoogleNewsRss(xml: string): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = decodeXml(
      item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""
    );
    const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const source = item.match(/<source url="([^"]+)"/)?.[1];
    const date = Date.parse(item.match(/<pubDate>([^<]+)</)?.[1] ?? "");
    if (!title || !link || !source) continue;
    hits.push({
      url: link,
      title,
      domain: siteOf(decodeXml(source)),
      publishedAt: Number.isFinite(date) ? Math.floor(date / 1000) : null,
      provider: "gnews",
    });
  }
  return hits;
}

/** Google News RSS search. Its feed terms say personal, non-commercial use,
 * so only the eval script uses it; the Worker step does not. */
export async function searchGoogleNews(query: string): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    q: `${query} when:2d`,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  const res = await get(`https://news.google.com/rss/search?${params}`);
  return parseGoogleNewsRss(await cappedText(res)).slice(0, 30);
}

/** Firecrawl `POST /v2/search` news results from the past week (the judge
 * applies the 48h window). Shape from docs.firecrawl.dev; not exercised
 * live because no key exists yet. A `date` Date.parse cannot read is null. */
export async function searchFirecrawl(
  query: string,
  apiKey: string
): Promise<SearchHit[]> {
  const res = await get("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, limit: 10, sources: ["news"], tbs: "qdr:w" }),
  });
  return parseFirecrawlNews(await res.json());
}

export function parseFirecrawlNews(body: unknown): SearchHit[] {
  const news =
    (
      body as {
        data?: { news?: { url?: string; title?: string; date?: string }[] };
      }
    ).data?.news ?? [];
  return news
    .filter((d) => d.url && d.title)
    .map((d) => {
      const ms = d.date ? Date.parse(d.date) : Number.NaN;
      return {
        url: d.url as string,
        title: d.title as string,
        domain: siteOf(d.url as string),
        publishedAt: Number.isFinite(ms) ? Math.floor(ms / 1000) : null,
        provider: "firecrawl",
      };
    });
}
