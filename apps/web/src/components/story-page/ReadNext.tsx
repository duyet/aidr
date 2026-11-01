import { type ReactElement, useEffect, useState } from "react";
import { fetchJson, getCachedJson } from "../../lib/client-cache";
import { archiveDateOfSec } from "../../lib/day-archive";
import { localizedTitle } from "../../lib/display-title";
import { categoryLabel } from "../../lib/lang";
import { withLang } from "../../lib/locale-url";
import { publisherHost } from "../../lib/publisher-host";
import { storyPath } from "../../lib/slug";
import { resizeCdnImageUrl, thumbRouteUrl } from "../../lib/tldr-images";
import type { FeedItem, FeedResponse, Lang } from "../../lib/types";
import { nextArchiveDate } from "./lib";

export const READ_NEXT_LIMIT = 3;
/** `/api/feed` is public for 60s at the browser (max-age=60). */
const FEED_TTL_MS = 60_000;

/** The same-day feed window for `item`: one Vietnam day, the story's
 * category when it has one, an explicit `lang` so the edge may cache it. */
export function readNextUrl(
  item: Pick<FeedItem, "published_at" | "category">,
  lang: Lang
): string | null {
  const date = archiveDateOfSec(item.published_at);
  const before = date ? nextArchiveDate(date) : null;
  if (!date || !before) return null;
  const params = new URLSearchParams({ days: "1", before });
  if (item.category) params.set("category", item.category);
  return withLang(`/api/feed?${params.toString()}`, lang);
}

/** The day's best other stories, by stored rank score. */
export function pickReadNext(
  feed: Pick<FeedResponse, "days"> | null,
  item: Pick<FeedItem, "id" | "published_at">,
  limit = READ_NEXT_LIMIT
): FeedItem[] {
  if (!feed) return [];
  const day = archiveDateOfSec(item.published_at);
  return feed.days
    .flatMap((d) => d.items)
    .filter(
      (other) =>
        other.id !== item.id && archiveDateOfSec(other.published_at) === day
    )
    .sort((a, b) => b.rank_score - a.rank_score)
    .slice(0, limit);
}

function ReadNextRow({
  item,
  lang,
}: {
  item: FeedItem;
  lang: Lang;
}): ReactElement {
  const { text, fallbackFromEnglish } = localizedTitle(item, lang);
  // Same order as the feed thumb: the same-origin resizer, then the
  // publisher image, then the semicolon tile.
  const candidates = [
    thumbRouteUrl(item.id, item.image_url),
    resizeCdnImageUrl(item.image_url, "thumb"),
  ].filter((u): u is string => Boolean(u));
  const [failed, setFailed] = useState(0);
  const thumb = candidates[failed] ?? null;
  const meta = [
    item.category ? categoryLabel(item.category, lang) : null,
    publisherHost(item.url),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <a
        href={storyPath(item, lang)}
        data-kb=""
        className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-md py-2"
      >
        {thumb ? (
          <img
            key={thumb}
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed((n) => n + 1)}
            width={88}
            height={50}
            loading="lazy"
            decoding="async"
            className="aspect-video w-[88px] rounded-md bg-muted object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid aspect-video w-[88px] place-items-center rounded-md bg-muted font-semibold text-muted-foreground"
          >
            ;
          </span>
        )}
        <span className="min-w-0">
          <span
            lang={fallbackFromEnglish ? "en" : undefined}
            className="block text-sm leading-snug text-foreground [overflow-wrap:anywhere] hover:underline"
          >
            {text}
          </span>
          {meta && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {meta}
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

/**
 * "Read next": up to three other stories from the same day and category.
 * Fetched after hydration from the public, edge-cached `/api/feed`, so the
 * story HTML and its loader stay one D1 read. Renders nothing until there
 * is something to show, and nothing on a failed read.
 */
export function ReadNext({
  item,
  lang,
}: {
  item: FeedItem;
  lang: Lang;
}): ReactElement | null {
  const [items, setItems] = useState<FeedItem[]>([]);
  useEffect(() => {
    const url = readNextUrl(item, lang);
    if (!url) return;
    let live = true;
    const cached = getCachedJson<FeedResponse>(url, FEED_TTL_MS);
    if (cached) {
      setItems(pickReadNext(cached, item));
      return;
    }
    void fetchJson<FeedResponse>(url).then((feed) => {
      if (live) setItems(pickReadNext(feed, item));
    });
    return () => {
      live = false;
    };
  }, [item.id, lang]);

  if (items.length === 0) return null;
  return (
    <section
      aria-label={lang === "vi" ? "Đọc tiếp" : "Read next"}
      className="border-t border-border pt-3.5"
    >
      <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {lang === "vi" ? "Đọc tiếp" : "Read next"}
      </h2>
      <ul className="mt-1">
        {items.map((other) => (
          <ReadNextRow key={other.id} item={other} lang={lang} />
        ))}
      </ul>
    </section>
  );
}
