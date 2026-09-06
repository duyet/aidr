import { track } from "@aidr/ui/track";
import { categoryLabel } from "../lib/lang";
import type { Lang } from "../lib/types";
import { useHorizontalScroll } from "../lib/use-horizontal-scroll";

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

  if (categories.length === 0) return null;

  return (
    <nav
      ref={scrollRef}
      className="edge-fade-x scrollbar-hide flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-3"
    >
      <button
        type="button"
        onClick={() => {
          track("topic_filter", { tag: "all" });
          for (const name of selected) onToggle(name);
        }}
        aria-pressed={selected.size === 0}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,opacity] duration-150 ${
          selected.size === 0
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
              track("topic_filter", { tag: c.name });
              onToggle(c.name);
            }}
            aria-pressed={isSelected}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-[background-color,color,opacity] duration-150 ${
              isSelected
                ? "bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {categoryLabel(c.name, lang)}{" "}
            <span className={isSelected ? "opacity-80" : "text-xs opacity-70"}>
              {c.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
