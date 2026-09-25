import { useState } from "react";
import { emptyFeedCopy } from "../lib/empty-feed";
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
}: {
  feed: FeedResponse;
  days: DayGroup[];
  lang: Lang;
  selectedTag: string | null;
  q: string | undefined;
  selectedCategoryCount: number;
  onMergeOlder: (older: FeedResponse) => void;
}) {
  const [loadingOlder, setLoadingOlder] = useState(false);

  return (
    <>
      {days.map((day) => (
        <DaySection
          key={day.date}
          day={day}
          lang={lang}
          selectedTag={selectedTag}
        />
      ))}
      {feed.hasMore && (
        <div className="pt-8 text-center">
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
            className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-50"
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
