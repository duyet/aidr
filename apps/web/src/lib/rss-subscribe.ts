import type { RssSubscribeTarget } from "./analytics/events";
import { absoluteSiteUrl } from "./locale-url";
import { RSS_FEED_PATH } from "./site";
import type { Lang } from "./types";

/**
 * The subscribable feed URL. No UTM: a tagged URL would register as a second
 * feed in readers and disagree with the document's `atom:link rel="self"`.
 */
export function feedUrl(lang: Lang): string {
  return absoluteSiteUrl(RSS_FEED_PATH, lang);
}

export function feedLangsFor(lang: Lang): readonly Lang[] {
  return lang === "vi" ? ["vi", "en"] : ["en", "vi"];
}

export const RSS_READERS = [
  {
    id: "feedly",
    label: "Feedly",
    href: (url: string) =>
      `https://feedly.com/i/subscription/feed%2F${encodeURIComponent(url)}`,
  },
  {
    id: "inoreader",
    label: "Inoreader",
    href: (url: string) =>
      `https://www.inoreader.com/?add_feed=${encodeURIComponent(url)}`,
  },
  {
    id: "newsblur",
    label: "NewsBlur",
    href: (url: string) =>
      `https://www.newsblur.com/?url=${encodeURIComponent(url)}`,
  },
  {
    id: "feed",
    label: "feed:",
    href: (url: string) => `feed:${url}`,
  },
] as const satisfies readonly {
  id: Exclude<RssSubscribeTarget, "copy">;
  label: string;
  href: (url: string) => string;
}[];
