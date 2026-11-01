import { feedTag } from "../lib/analytics/schema";
import { track } from "../lib/analytics/track";
import type { Lang } from "../lib/types";
import { useHorizontalScroll } from "../lib/use-horizontal-scroll";
import { CategoryLabel } from "./CategoryLabel";

export function CategoryNav({
  categories,
  selected,
  onToggle,
  lang,
}: {
  categories: { name: string; count: number }[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  lang: Lang;
}) {
  const scrollRef = useHorizontalScroll<HTMLElement>();
  const names = categories.map((c) => c.name);

  if (categories.length === 0) return null;

  return (
    <nav
      ref={scrollRef}
      className="edge-fade-x scrollbar-hide flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-0.5 pt-4 pb-1.5"
    >
      <button
        type="button"
        onClick={() => {
          track("topic_filter", { tag: "all", from: "nav" });
          for (const name of selected) onToggle(name);
        }}
        aria-pressed={selected.size === 0}
        className={`inline-flex h-11 shrink-0 sm:h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-[background-color,color,border-color] duration-150 ${
          selected.size === 0
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {lang === "vi" ? "Tất cả" : "All"}
      </button>
      {categories.map((c) => {
        const isSelected = selected.has(c.name);
        return (
          <button
            key={c.name}
            type="button"
            onClick={() => {
              const tag = feedTag(c.name, names);
              if (tag) track("topic_filter", { tag, from: "nav" });
              onToggle(c.name);
            }}
            aria-pressed={isSelected}
            className={`inline-flex h-11 shrink-0 sm:h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-[background-color,color,border-color] duration-150 ${
              isSelected
                ? "border-primary bg-primary font-medium text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <CategoryLabel
              name={c.name}
              lang={lang}
              colored={!isSelected}
              dot={isSelected}
            />
            {/* Semantic quiet tokens, not an opacity utility: element opacity
                composites toward the surface behind the pill (the per-user
                reader background included), so it declared no color the
                contrast test could assert. */}
            <span
              className={
                isSelected
                  ? "text-primary-foreground-quiet text-xs tabular-nums"
                  : "text-quiet-foreground text-xs tabular-nums"
              }
            >
              {c.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
