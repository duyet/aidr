import { ArrowRight } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { fetchJson, getCachedJson } from "../../lib/client-cache";
import { archiveDateOfSec } from "../../lib/day-archive";
import { categoryLabel } from "../../lib/lang";
import { withLang } from "../../lib/locale-url";
import { usePrefs } from "../../lib/prefs";
import { publisherHost } from "../../lib/publisher-host";
import { storyPath } from "../../lib/slug";
import { resizeCdnImageUrl, thumbRouteUrl } from "../../lib/tldr-images";
import { topicStyle } from "../../lib/topic";
import type { FeedItem, FeedResponse, Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { titleParts } from "../story/story-text";
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
  const { prefs } = usePrefs();
  const titles = titleParts(item, lang, {
    bilingual: prefs.bilingual,
    first: prefs.bilingualFirst,
  });
  // Same order as the feed thumb: the same-origin resizer, then the
  // publisher image, then the semicolon tile.
  const candidates = [
    thumbRouteUrl(item.id, item.image_url),
    resizeCdnImageUrl(item.image_url, "thumb"),
  ].filter((u): u is string => Boolean(u));
  const [failed, setFailed] = useState(0);
  const thumb = candidates[failed] ?? null;
  const host = publisherHost(item.url);
  return (
    <li style={topicStyle(item.category)}>
      <a
        href={storyPath(item, lang)}
        data-kb=""
        className="grid grid-cols-[minmax(0,1fr)_64px] items-start gap-3 rounded-md py-2.5 transition-colors hover:bg-muted/60"
      >
        <span className="min-w-0">
          <span className="block text-[13.5px] leading-[1.4] font-medium text-foreground [overflow-wrap:anywhere]">
            {titles.map((part) => (
              <span
                key={part.lang}
                lang={part.lang}
                className={part.second ? "bi-second block" : "block"}
              >
                {part.text}
              </span>
            ))}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.category && (
              <span
                aria-hidden
                className="topic-dot inline-block size-2 shrink-0 rounded-full"
              />
            )}
            <span className="min-w-0 truncate">
              {[item.category ? categoryLabel(item.category, lang) : null, host]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </span>
        {thumb ? (
          <img
            key={thumb}
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed((n) => n + 1)}
            width={64}
            height={40}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-16 rounded-lg bg-muted object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid aspect-[16/10] w-16 place-items-center rounded-lg bg-muted font-semibold text-muted-foreground"
          >
            ;
          </span>
        )}
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
  className,
}: {
  item: FeedItem;
  lang: Lang;
  className?: string;
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
    <aside
      aria-label={lang === "vi" ? "Đọc tiếp" : "Read next"}
      className={className}
    >
      <h2 className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-[0.07em] text-foreground uppercase">
        <ArrowRight className="size-[15px]" aria-hidden />
        <Bi vi="Đọc tiếp" en="Read next" inline />
      </h2>
      <ul className="mt-2">
        {items.map((other) => (
          <ReadNextRow key={other.id} item={other} lang={lang} />
        ))}
      </ul>
    </aside>
  );
}
