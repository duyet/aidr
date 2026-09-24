import { formatDayHeading } from "../lib/lang";
import type { DayGroup, Lang } from "../lib/types";
import { CategoryLabel } from "./CategoryLabel";
import { StoryRow } from "./StoryRow";

export function DaySection({
  day,
  lang,
  selectedTag,
}: {
  day: DayGroup;
  lang: Lang;
  selectedTag?: string | null;
}) {
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
          {formatDayHeading(day.date, lang)}
        </h2>
        <span className="text-xs text-muted-foreground">
          {day.items.length}{" "}
          {lang === "vi" ? "tin" : day.items.length === 1 ? "story" : "stories"}
        </span>
        <span className="hidden flex-wrap gap-x-3 text-xs text-muted-foreground md:flex">
          {shown.map(([name, count]) => (
            <span key={name}>
              <CategoryLabel name={name} lang={lang} />{" "}
              <span className="font-medium text-foreground/80">{count}</span>
            </span>
          ))}
          {more > 0 && <span>+{more} more</span>}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {day.items.map((item, i) => (
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
    </section>
  );
}
