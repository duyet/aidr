import { useState } from "react";
import { dayArchivePath } from "../lib/day-archive";
import { formatDayHeading } from "../lib/lang";
import type { DayGroup, Lang } from "../lib/types";
import { CategoryLabel } from "./CategoryLabel";
import { StoryRow } from "./StoryRow";

export function DaySection({
  day,
  lang,
  selectedTag,
  linkToDay = false,
  limit,
  onLoadAll,
}: {
  day: DayGroup;
  lang: Lang;
  selectedTag?: string | null;
  /** Feed pages link each day heading to its /date archive page. */
  linkToDay?: boolean;
  /** Render at most this many stories until the reader asks for more. */
  limit?: number;
  /** Fetch the rest of a day the payload carries only part of
   * (`day.totalItems`). Resolves false when the fetch failed. */
  onLoadAll?: (day: DayGroup) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const total = day.totalItems ?? day.items.length;
  const visible =
    limit === undefined || expanded ? day.items : day.items.slice(0, limit);
  const hidden = total - visible.length;
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);

  async function loadMore() {
    if (day.totalItems !== undefined && day.totalItems > day.items.length) {
      if (!onLoadAll) return;
      setLoading(true);
      try {
        if (!(await onLoadAll(day))) return;
      } finally {
        setLoading(false);
      }
    }
    setExpanded(true);
  }

  const counts = Object.entries(day.categoryCounts).sort((a, b) => b[1] - a[1]);
  const shown = counts.slice(0, 7);
  const more = counts.length - shown.length;

  return (
    // content-visibility lets the browser skip layout/paint for day
    // sections below the fold; SSR markup stays intact for SEO and
    // find-in-page. contain-intrinsic-size keeps the scrollbar estimate
    // sane until a section first renders (~a day of stories ≈ 1600px).
    <section className="pt-8 [content-visibility:auto] [contain-intrinsic-size:auto_1600px]">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-3">
        <h2 className="font-serif text-2xl font-medium tracking-tight">
          {linkToDay ? (
            <a
              href={dayArchivePath(day.date, lang)}
              className="rounded-sm hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {formatDayHeading(day.date, lang)}
            </a>
          ) : (
            formatDayHeading(day.date, lang)
          )}
        </h2>
        <span className="text-xs text-muted-foreground">
          {total} {lang === "vi" ? "tin" : total === 1 ? "story" : "stories"}
        </span>
        <span className="hidden flex-wrap gap-x-3 text-xs text-muted-foreground md:flex">
          {shown.map(([name, count]) => (
            <span key={name}>
              <CategoryLabel name={name} lang={lang} />{" "}
              <span className="font-medium text-foreground/80">{count}</span>
            </span>
          ))}
          {more > 0 && (
            <span>{lang === "vi" ? `+${more} nữa` : `+${more} more`}</span>
          )}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {visible.map((item, i) => (
          <StoryRow
            key={item.id}
            item={item}
            index={i + 1}
            lang={lang}
            hot={i === 0 && item.rank_score > 0 && day.items.length > 1}
            selectedTag={selectedTag}
          />
        ))}
      </div>
      {hidden > 0 && (
        <div className="pt-4 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={loadMore}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {loading
              ? t("Loading…", "Đang tải…")
              : t(`Load more (${hidden})`, `Xem thêm (${hidden})`)}
          </button>
        </div>
      )}
    </section>
  );
}
