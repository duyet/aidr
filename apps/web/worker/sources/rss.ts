import type { FetchedItem, SourceAdapter } from "./types.js";

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  );
  if (!match) return null;
  const text = decodeXml(match[1]);
  return text || null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRssItems(xml: string): FetchedItem[] {
  const chunks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const items: FetchedItem[] = [];
  for (const chunk of chunks) {
    const title = tagText(chunk, "title");
    const url = tagText(chunk, "link") ?? tagText(chunk, "guid");
    if (!title || !url || !/^https?:\/\//i.test(url)) continue;
    const pub = tagText(chunk, "pubDate") ?? tagText(chunk, "published");
    const publishedMs = pub ? Date.parse(pub) : Number.NaN;
    const publishedAt = Number.isFinite(publishedMs) ? publishedMs : Date.now();
    const rawSummary =
      tagText(chunk, "description") ?? tagText(chunk, "summary");
    const summary = rawSummary
      ? stripHtml(rawSummary).slice(0, 1200)
      : undefined;
    items.push({
      url,
      title,
      summary: summary || undefined,
      publishedAt,
      sources: [
        { kind: "source", url, postedAt: Math.floor(publishedAt / 1000) },
      ],
    });
  }
  return items;
}

/**
 * Generic RSS/Atom-ish `<item>` feed. Config: `{ "feed": "https://…/rss.xml" }`.
 */
export const rssAdapter: SourceAdapter = {
  type: "rss",

  async fetchItems(config, sinceEpochSec) {
    const feed = typeof config.feed === "string" ? config.feed.trim() : "";
    if (!feed) return [];
    const res = await fetch(feed, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const sinceMs = sinceEpochSec * 1000;
    return parseRssItems(xml).filter((item) => item.publishedAt >= sinceMs);
  },
};
