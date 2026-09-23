import { Tag } from "lucide-react";
import { categoryLabel, timeAgo } from "../../lib/lang";
import type { FilterSuggestion, StorySuggestion } from "../../lib/search-match";
import type { Lang } from "../../lib/types";

function HighlightedMatch({
  text,
  start,
  end,
}: {
  text: string;
  start: number;
  end: number;
}) {
  return (
    <>
      {text.slice(0, start)}
      <span className="font-semibold text-accent">
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

/** The typeahead dropdown — an optional topic/category filter row on top,
 * then the matched story rows. */
export function SearchResults({
  filterMatch,
  storyMatches,
  activeIndex,
  lang,
  onSelectFilter,
  onSelectStory,
}: {
  filterMatch: FilterSuggestion | null;
  storyMatches: StorySuggestion[];
  activeIndex: number;
  lang: Lang;
  onSelectFilter: () => void;
  onSelectStory: (item: StorySuggestion["item"]) => void;
}) {
  return (
    <div
      role="listbox"
      className="scrollbar-hide absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background text-left shadow-lg"
    >
      {filterMatch && (
        <button
          type="button"
          role="option"
          aria-selected={activeIndex === 0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSelectFilter}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
            activeIndex === 0 ? "bg-muted" : "hover:bg-muted"
          }`}
        >
          <Tag className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{filterMatch.value}</span>
          <span className="shrink-0 text-muted-foreground">
            {lang === "vi" ? "Lọc theo chủ đề" : "Filter by topic"}
          </span>
        </button>
      )}
      {storyMatches.map((m, i) => {
        const rowIndex = filterMatch ? i + 1 : i;
        return (
          <button
            key={m.item.id}
            type="button"
            role="option"
            aria-selected={activeIndex === rowIndex}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelectStory(m.item)}
            className={`flex w-full flex-col gap-0.5 border-t border-border px-3 py-2 text-left text-xs ${
              activeIndex === rowIndex ? "bg-muted" : "hover:bg-muted"
            }`}
          >
            <span className="truncate text-foreground">
              <HighlightedMatch
                text={m.title}
                start={m.matchStart}
                end={m.matchEnd}
              />
            </span>
            <span className="text-[11px] text-muted-foreground">
              {m.item.category && categoryLabel(m.item.category, lang)}
              {m.item.category && " · "}
              {timeAgo(m.item.published_at, Date.now(), lang)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
