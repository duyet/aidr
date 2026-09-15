import type { FetchedItem, SourceAdapter } from "./types.js";

const SITEMAP_URL = "https://x.ai/sitemap.xml";
const NEWS_URL = "https://x.ai/news";
const NEWS_LOC = /^https:\/\/x\.ai\/news\/([^/?#]+)$/i;

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (/^\d/.test(part)) return part;
      if (/^(xai|ai|api|stt|tts)$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  );
  return match ? decodeHtml(match[1]) : null;
}

/** Sitemap locs under `/news/<slug>` (not the `/news` index). */
export function parseXaiSitemap(xml: string): FetchedItem[] {
  const chunks = xml.match(/<url\b[\s\S]*?<\/url>/gi) ?? [];
  const seen = new Map<string, FetchedItem>();
  for (const chunk of chunks) {
    const loc = tagText(chunk, "loc");
    if (!loc) continue;
    const match = loc.match(NEWS_LOC);
    if (!match) continue;
    const url = loc.replace(/\/$/, "");
    if (seen.has(url)) continue;
    const lastmod = tagText(chunk, "lastmod");
    const publishedMs = lastmod ? Date.parse(lastmod) : Number.NaN;
    const publishedAt = Number.isFinite(publishedMs) ? publishedMs : Date.now();
    seen.set(url, {
      url,
      title: titleFromSlug(match[1]),
      publishedAt,
      sources: [
        {
          kind: "source",
          url,
          postedAt: Math.floor(publishedAt / 1000),
        },
      ],
    });
  }
  return [...seen.values()];
}

/** Listing cards: `<a href="/news/…">` plus a heading. */
export function parseXaiNews(html: string): Map<string, string> {
  const titles = new Map<string, string>();
  const cardRe = /<a[^>]+href="(\/news\/[^"#?]+)"[\s\S]*?<\/a>/gi;
  let match: RegExpExecArray | null = cardRe.exec(html);
  while (match) {
    const path = match[1].replace(/\/$/, "");
    const block = match[0];
    if (path === "/news") {
      match = cardRe.exec(html);
      continue;
    }
    const heading = block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const title = heading
      ? decodeHtml(heading[1].replace(/<[^>]+>/g, ""))
      : null;
    if (title) titles.set(`https://x.ai${path}`, title);
    match = cardRe.exec(html);
  }
  return titles;
}

/**
 * xAI News has no official RSS. Sitemap `/news/<slug>` locs plus the
 * `/news` listing for human titles.
 */
export const xaiAdapter: SourceAdapter = {
  type: "xai",

  async fetchItems(_config, sinceEpochSec) {
    const [sitemapRes, htmlRes] = await Promise.all([
      fetch(SITEMAP_URL, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "application/xml, text/xml" },
      }),
      fetch(NEWS_URL, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: "text/html" },
      }),
    ]);
    if (!sitemapRes.ok) return [];
    const xml = await sitemapRes.text();
    const titles = htmlRes.ok
      ? parseXaiNews(await htmlRes.text())
      : new Map<string, string>();
    const sinceMs = sinceEpochSec * 1000;
    return parseXaiSitemap(xml)
      .map((item) => {
        const title = titles.get(item.url);
        return title ? { ...item, title } : item;
      })
      .filter((item) => item.publishedAt >= sinceMs);
  },
};
