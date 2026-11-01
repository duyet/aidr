import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { dayArchivePath } from "../lib/day-archive";
import { formatDayHeading } from "../lib/lang";
import type { DayGroup, Lang } from "../lib/types";
import { CategoryLabel } from "./CategoryLabel";
import { STORY_ROW_COLS, StoryRow } from "./StoryRow";

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
  linkToDay?: boolean;
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
    <section className="pt-7 [content-visibility:auto] [contain-intrinsic-size:auto_1600px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2.5">
        <h2 className="text-[18px] font-semibold leading-tight tracking-[-0.015em] text-foreground sm:text-[20px]">
          {linkToDay ? (
            <a
              href={dayArchivePath(day.date, lang)}
              className="rounded-[6px] hover:text-accent"
            >
              {formatDayHeading(day.date, lang)}
            </a>
          ) : (
            formatDayHeading(day.date, lang)
          )}
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] tabular-nums text-muted-foreground">
          {total} {lang === "vi" ? "tin" : total === 1 ? "story" : "stories"}
        </span>
        <span className="hidden flex-wrap gap-x-3.5 text-[12px] text-muted-foreground md:flex">
          {shown.map(([name, count]) => (
            <span key={name}>
              <CategoryLabel name={name} lang={lang} quiet />{" "}
              <span className="font-medium text-foreground tabular-nums">
                {count}
              </span>
            </span>
          ))}
          {more > 0 && (
            <span>{lang === "vi" ? `+${more} nữa` : `+${more} more`}</span>
          )}
        </span>
      </div>
      <div
        className={`story-legend ${STORY_ROW_COLS} border-b border-border pb-1.5 pt-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground`}
        aria-hidden="true"
      >
        <span className="text-right">#</span>
        <span>{t("Story", "Tin")}</span>
        <span className="hidden sm:block">{t("Topic", "Chủ đề")}</span>
        <span className="hidden text-right sm:block">{t("Time", "Lúc")}</span>
        <span className="text-right">{t("Score", "Điểm")}</span>
      </div>
      <div className="divide-y divide-border">
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
        <div className="border-t border-border pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={loadMore}
            className="inline-flex h-11 w-full items-center sm:h-9 justify-center gap-1.5 rounded-full border border-input px-4 text-[13px] font-medium text-foreground tabular-nums hover:bg-muted disabled:opacity-50"
          >
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
            {loading
              ? t("Loading…", "Đang tải…")
              : t(`Load more (${hidden})`, `Xem thêm (${hidden})`)}
          </button>
        </div>
      )}
    </section>
  );
}
