import { useState } from "react";
import { emptyFeedCopy } from "../lib/empty-feed";
import { DAY_STORY_LIMIT, dayFeedQuery } from "../lib/homepage-feed";
import { withLang } from "../lib/locale-url";
import type { DayGroup, FeedResponse, Lang } from "../lib/types";
import { DaySection } from "./DaySection";

/** The "days" feed section: day groups, the older-days pager, and the
 * empty-feed copy when filters hide everything. */
export function FeedDays({
  feed,
  days,
  lang,
  selectedTag,
  q,
  selectedCategoryCount,
  onMergeOlder,
  onLoadDay,
}: {
  feed: FeedResponse;
  days: DayGroup[];
  lang: Lang;
  selectedTag: string | null;
  q: string | undefined;
  selectedCategoryCount: number;
  onMergeOlder: (older: FeedResponse) => void;
  /** Swap in the whole of a day the SSR payload trimmed. */
  onLoadDay: (day: DayGroup) => void;
}) {
  const [loadingOlder, setLoadingOlder] = useState(false);

  async function loadDay(day: DayGroup): Promise<boolean> {
    try {
      const res = await fetch(
        withLang(`/api/feed${dayFeedQuery(day.date)}`, lang)
      );
      if (!res.ok) return false;
      const page = (await res.json()) as FeedResponse;
      const full = page.days.find((d) => d.date === day.date);
      if (!full) return false;
      onLoadDay(full);
      return true;
    } catch {
      return false;
    }
  }

  return (
    <>
      {days.map((day) => (
        <DaySection
          key={day.date}
          day={day}
          lang={lang}
          selectedTag={selectedTag}
          linkToDay
          limit={DAY_STORY_LIMIT}
          onLoadAll={loadDay}
        />
      ))}
      {feed.hasMore && (
        <div className="pt-10 text-center">
          <button
            type="button"
            disabled={loadingOlder}
            onClick={async () => {
              const oldest = feed.days[feed.days.length - 1]?.date;
              if (!oldest) return;
              setLoadingOlder(true);
              try {
                const res = await fetch(
                  withLang(
                    `/api/feed?days=5&before=${encodeURIComponent(oldest)}`,
                    lang
                  )
                );
                if (!res.ok) return;
                const older = (await res.json()) as FeedResponse;
                onMergeOlder(older);
              } finally {
                setLoadingOlder(false);
              }
            }}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {loadingOlder
              ? lang === "vi"
                ? "Đang tải…"
                : "Loading…"
              : lang === "vi"
                ? "Ngày cũ hơn"
                : "Older days"}
          </button>
        </div>
      )}
      {days.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">
          {emptyFeedCopy({ lang, q, selectedCategoryCount })}
        </p>
      )}
    </>
  );
}
