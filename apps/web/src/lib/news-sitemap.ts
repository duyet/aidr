/**
 * Google News sitemap at `/news.xml`.
 *
 * What this is: a `news:`-namespaced sitemap built from the same `getFeed`
 * loader as `/api/feed` and `/feed.xml`, so the news surface can never
 * describe a story the product feed does not have. It is emitted because it is
 * correct, cheap, and improves discovery.
 *
 * What this is NOT: publisher onboarding. Google News publisher status is
 * about original reporting, and aidr is an aggregator that summarizes and
 * links to publishers. `news:publication > news:name` is therefore the aidr
 * publication — the site publishing this sitemap and the name on
 * news.google.com — never the upstream outlet, and nothing here claims
 * aidr is a Google News publisher.
 *
 * Split rule (documented, deterministic):
 *   - The window is the newest `NEWS_SITEMAP_WINDOW_DAYS` days, which is the
 *     window Google News itself expects a news sitemap to cover.
 *   - At most `NEWS_SITEMAP_MAX_ENTRIES` `news:news` nodes are emitted,
 *     newest first.
 *   - Anything dropped by that cap is NOT lost: it stays in the date-sharded
 *     sitemap children, which cover the whole published archive. Only the news
 *     surface is bounded.
 */
import { readSession } from "./db";
import { getFeed } from "./feed-queries";
import { epochSeconds, feedItemsNewestFirst, renderedTitle } from "./rss";
import { SITE_NAME, SITE_URL } from "./site";
import { escapeXml, sitemapResponse } from "./sitemap";
import { storyPath } from "./slug";
import type { FeedItem, Lang } from "./types";

export const NEWS_NAMESPACE = "http://www.google.com/schemas/sitemap-news/0.9";
export const NEWS_SITEMAP_CONTENT_TYPE = "application/xml; charset=utf-8";
/** The Google News recency window. Older stories belong in the plain shards. */
export const NEWS_SITEMAP_WINDOW_DAYS = 2;
/** Hard cap on `news:news` nodes, as documented in the split rule above. */
export const NEWS_SITEMAP_MAX_ENTRIES = 1000;
/** `news:title` is a headline; `/api/public` clamps story text to 400 chars. */
export const NEWS_TITLE_MAX = 400;
/**
 * The audience timezone is Asia/Ho_Chi_Minh (worker/time.ts
 * `AUDIENCE_TIMEZONE`), which has had a fixed +07:00 offset and no DST, so a
 * constant offset is exact rather than an approximation.
 */
const ICT_OFFSET_MINUTES = 7 * 60;

/**
 * W3C datetime for `news:publication_date`, in the reader's timezone:
 * `YYYY-MM-DDThh:mm:ss+07:00`. Seconds come from `epochSeconds`, so a
 * millisecond row cannot render as a year-2286 publication.
 */
export function w3cPublicationDate(epoch: number | null | undefined): string {
  const seconds = epochSeconds(epoch);
  if (seconds <= 0) return "";
  const shifted = new Date(seconds * 1000 + ICT_OFFSET_MINUTES * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}+07:00`;
}

export interface NewsSitemapEntry {
  loc: string;
  title: string;
  /** ISO 639-1 code of the language actually rendered at `loc`. */
  language: Lang;
  publicationDate: string;
}

/**
 * The variant a reader actually sees for this story: Vietnamese when a
 * Vietnamese title exists, English otherwise. Emitting both explicit-locale
 * URLs would hand Google two entries for the same story, and would require
 * labelling an untranslated English title as Vietnamese.
 */
export function newsEntryForItem(item: FeedItem): NewsSitemapEntry {
  const lang: Lang = item.title_vi?.trim() ? "vi" : "en";
  return {
    loc: `${SITE_URL}${storyPath(item, lang)}`,
    title: renderedTitle(item, lang),
    language: lang,
    publicationDate: w3cPublicationDate(item.published_at),
  };
}

export function buildNewsSitemapXml(entries: NewsSitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        "    <news:news>",
        "      <news:publication>",
        `        <news:name>${escapeXml(SITE_NAME)}</news:name>`,
        `        <news:language>${escapeXml(entry.language)}</news:language>`,
        "      </news:publication>",
        `      <news:title>${escapeXml(entry.title)}</news:title>`,
      ];
      if (entry.publicationDate) {
        parts.push(
          `      <news:publication_date>${escapeXml(entry.publicationDate)}</news:publication_date>`
        );
      }
      parts.push("    </news:news>", "  </url>");
      return parts.join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="${NEWS_NAMESPACE}">\n${urls}\n</urlset>\n`;
}

/** Same loader, same bounds, same stories as `/api/feed` and `/feed.xml`. */
export async function loadNewsSitemapEntries(
  db: D1Database
): Promise<NewsSitemapEntry[]> {
  const feed = await getFeed(readSession(db), {
    days: NEWS_SITEMAP_WINDOW_DAYS,
  });
  return feedItemsNewestFirst(feed)
    .slice(0, NEWS_SITEMAP_MAX_ENTRIES)
    .map(newsEntryForItem)
    .map((entry) => ({
      ...entry,
      title:
        entry.title.length <= NEWS_TITLE_MAX
          ? entry.title
          : entry.title.slice(0, NEWS_TITLE_MAX),
    }))
    .filter(
      (entry) => entry.title.length > 0 && entry.publicationDate.length > 0
    );
}

/**
 * Always 200 XML, exactly like the sitemap children: a D1 failure degrades to
 * a valid, empty news document rather than a 5xx a crawler would retry.
 */
export async function safeNewsSitemapResponse(
  loadEntries: () => Promise<NewsSitemapEntry[]> | NewsSitemapEntry[]
): Promise<Response> {
  try {
    const response = sitemapResponse(buildNewsSitemapXml(await loadEntries()));
    response.headers.set("x-robots-tag", "index, follow");
    return response;
  } catch (error) {
    console.error("news.xml failed; serving empty news sitemap", error);
    return sitemapResponse(buildNewsSitemapXml([]));
  }
}
