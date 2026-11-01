import { archiveDateOfSec, dayBoundsSec } from "../../lib/day-archive";
import { publisherHost } from "../../lib/publisher-host";
import type { FeedItem, ItemSource, Lang } from "../../lib/types";
import { hasRowContent, safeSourceUrl } from "../story/StorySources";

/** "31.10.2026" / "Oct 31, 2026" for an archive day. Built from the
 * Asia/Ho_Chi_Minh `YYYY-MM-DD`, so the words name the day the archive
 * link opens, never the UTC day. */
export function shortDayLabel(date: string, lang: Lang): string {
  const [y, m, d] = date.split("-");
  if (lang === "vi") return `${d}.${m}.${y}`;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "09:30" in the audience zone, the same zone as the archive day. */
export function storyClock(epochSec: number): string {
  if (!Number.isFinite(epochSec)) return "";
  return new Date(epochSec * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** The archive day after `date`, for a `before=` feed window. */
export function nextArchiveDate(date: string): string | null {
  return archiveDateOfSec(dayBoundsSec(date).end);
}

const SOCIAL_HOSTS = new Set(["x.com", "twitter.com", "threads.net"]);

export interface SourceLink {
  key: string;
  label: string;
  href: string | null;
  quote: string | null;
}

/** A short name for one source: the author (an @handle on X), else the
 * publisher host. */
export function sourceName(
  source: Pick<ItemSource, "author" | "url">
): string | null {
  const href = safeSourceUrl(source.url);
  const host = publisherHost(href);
  const author = source.author?.trim();
  if (author) {
    const social = host ? SOCIAL_HOSTS.has(host) : false;
    return social && !author.startsWith("@") && !/\s/.test(author)
      ? `@${author}`
      : author;
  }
  return host;
}

/**
 * The story's sources for the one-line list: the article itself and every
 * `source` row first (deduplicated by link), then the supporting and
 * discussion rows that go behind "+ N more". Rows with nothing to show are
 * dropped, as StorySources does.
 */
export function splitSources(item: Pick<FeedItem, "url" | "sources">): {
  main: SourceLink[];
  more: ItemSource[];
} {
  const main: SourceLink[] = [];
  const seen = new Set<string>();
  const add = (source: Pick<ItemSource, "author" | "url" | "quote">) => {
    const href = safeSourceUrl(source.url);
    const label = sourceName(source);
    if (!label) return;
    const key = href ?? `name:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    main.push({ key, label, href, quote: source.quote ?? null });
  };
  const rows = item.sources.filter(hasRowContent);
  // The article link names the publisher; a `source` row for the same
  // link replaces it so its author wins.
  const articleHref = safeSourceUrl(item.url);
  const articleRow = rows.find(
    (s) => s.kind === "source" && safeSourceUrl(s.url) === articleHref
  );
  if (articleHref)
    add(articleRow ?? { author: null, url: item.url, quote: null });
  for (const s of rows) if (s.kind === "source") add(s);
  const more = rows.filter((s) => s.kind !== "source");
  return { main, more };
}

/** "By Berber Jin · wsj.com": the author of the article link itself, never
 * an aggregator that reposted it. */
export function storyByline(
  item: Pick<FeedItem, "url" | "sources">,
  lang: Lang
): string | null {
  const host = publisherHost(safeSourceUrl(item.url));
  const articleHref = safeSourceUrl(item.url);
  const author = item.sources
    .find(
      (s) =>
        s.kind === "source" &&
        s.author?.trim() &&
        articleHref &&
        safeSourceUrl(s.url) === articleHref
    )
    ?.author?.trim();
  if (author && host && author !== host) {
    return `${lang === "vi" ? "Theo" : "By"} ${author} · ${host}`;
  }
  if (author || host) {
    return `${lang === "vi" ? "Theo" : "From"} ${author ?? host}`;
  }
  return null;
}
