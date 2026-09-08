import type { FetchedItem, SourceAdapter } from "./types.js";

const NEWS_URL = "https://www.anthropic.com/news";
const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseNewsDate(raw: string): number | null {
  const match = raw.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s+(\d{4})\b/i
  );
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (month == null) return null;
  const ms = Date.UTC(Number(match[3]), month, Number(match[2]));
  return Number.isFinite(ms) ? ms : null;
}

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

/** Parse Anthropic /news listing cards (`<a href="/news/…">` + `<time>` + title). */
export function parseAnthropicNews(html: string): FetchedItem[] {
  const seen = new Map<string, FetchedItem>();
  const cardRe = /<a[^>]+href="(\/news\/[^"#?]+)"[\s\S]*?<\/a>/gi;
  let match: RegExpExecArray | null = cardRe.exec(html);
  while (match) {
    const path = match[1];
    const block = match[0];
    if (path === "/news" || path === "/news/") {
      match = cardRe.exec(html);
      continue;
    }
    const url = `https://www.anthropic.com${path}`;
    if (seen.has(url)) {
      match = cardRe.exec(html);
      continue;
    }
    const timeMatch = block.match(/<time[^>]*>([^<]+)<\/time>/i);
    const titleMatch =
      block.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ??
      block.match(
        /<(?:p|span)[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/(?:p|span)>/i
      );
    const title = titleMatch
      ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, ""))
      : null;
    if (!title) {
      match = cardRe.exec(html);
      continue;
    }
    const publishedAt = timeMatch
      ? (parseNewsDate(timeMatch[1]) ?? Date.now())
      : Date.now();
    seen.set(url, {
      url,
      title,
      publishedAt,
      sources: [
        {
          kind: "source",
          url,
          postedAt: Math.floor(publishedAt / 1000),
        },
      ],
    });
    match = cardRe.exec(html);
  }
  return [...seen.values()];
}

/**
 * Anthropic Newsroom has no official RSS. Config is unused (`{}`).
 */
export const anthropicAdapter: SourceAdapter = {
  type: "anthropic",

  async fetchItems(_config, sinceEpochSec) {
    const res = await fetch(NEWS_URL, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const sinceMs = sinceEpochSec * 1000;
    return parseAnthropicNews(html).filter(
      (item) => item.publishedAt >= sinceMs
    );
  },
};
