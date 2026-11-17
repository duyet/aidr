import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { dayArchivePath } from "../lib/day-archive";
import { formatDayHeading } from "../lib/lang";
import type { DayGroup, Lang } from "../lib/types";
import { Bi } from "./Bi";
import { CategoryLabel } from "./CategoryLabel";
import { anyVotes, StoryRow } from "./StoryRow";

const LABEL =
  "text-[12.5px] font-bold uppercase leading-tight tracking-[0.07em] text-foreground";

export function DaySection({
  day,
  lang,
  selectedTag,
  linkToDay = false,
  limit,
  onLoadAll,
  firstRank = 1,
  label,
  showVotes = anyVotes(day.items),
}: {
  day: DayGroup;
  lang: Lang;
  selectedTag?: string | null;
  linkToDay?: boolean;
  limit?: number;
  /** Fetch the rest of a day the payload carries only part of
   * (`day.totalItems`). Resolves false when the fetch failed. */
  onLoadAll?: (day: DayGroup) => Promise<boolean>;
  /** Rank of the first row, when a lead story above the list took the ranks
   * before it. */
  firstRank?: number;
  /** Replaces the date heading, for a list the page already dates. */
  label?: ReactNode;
  /** Defaults to whether this day has any vote. */
  showVotes?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const total = day.totalItems ?? day.items.length;
  const visible =
    limit === undefined || expanded ? day.items : day.items.slice(0, limit);
  const hidden = total - visible.length;

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
    // Its paint containment clips at the padding box, so the section pads
    // 12px to hold the rows' hover tint, which bleeds 12px past the text.
    <section className="-mx-3 px-3 [content-visibility:auto] [contain-intrinsic-size:auto_1600px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-1.5">
        {label ? (
          <h3 className={LABEL}>{label}</h3>
        ) : (
          <>
            <h2 className={LABEL}>
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
            <span className="text-[12.5px] tabular-nums text-muted-foreground">
              {total}{" "}
              {lang === "vi" ? "tin" : total === 1 ? "story" : "stories"}
            </span>
            <span className="hidden flex-wrap gap-x-3.5 text-[12.5px] text-muted-foreground md:flex">
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
          </>
        )}
      </div>
      <div className="np-columns">
        {visible.map((item, i) => (
          <StoryRow
            key={item.id}
            item={item}
            index={firstRank + i}
            lang={lang}
            hot={
              firstRank === 1 &&
              i === 0 &&
              item.rank_score > 0 &&
              day.items.length > 1
            }
            selectedTag={selectedTag}
            showVotes={showVotes}
          />
        ))}
      </div>
      {hidden > 0 && (
        <div className="py-3">
          <button
            type="button"
            disabled={loading}
            onClick={loadMore}
            className="btn-link w-full tabular-nums"
          >
            <ChevronDown aria-hidden="true" />
            {loading ? (
              <Bi vi="Đang tải…" en="Loading…" inline />
            ) : (
              <Bi
                vi={`Xem thêm (${hidden})`}
                en={`Load more (${hidden})`}
                inline
              />
            )}
          </button>
        </div>
      )}
    </section>
  );
}
