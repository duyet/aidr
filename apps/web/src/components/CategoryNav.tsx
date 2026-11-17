import { Toggle } from "@ui-sdk/react/toggle";
import { feedTag } from "../lib/analytics/schema";
import { track } from "../lib/analytics/track";
import type { Lang } from "../lib/types";
import { useHorizontalScroll } from "../lib/use-horizontal-scroll";
import { Bi } from "./Bi";
import { CategoryLabel } from "./CategoryLabel";

/** One row of topic chips: dot, name and count. The selected chip inverts
 * (`.chip`, styles.css), and picking chips filters the feed. */
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
      aria-label={lang === "vi" ? "Chủ đề" : "Topics"}
      className="edge-fade-x scrollbar-hide flex items-center gap-2 overflow-x-auto whitespace-nowrap px-0.5 py-1 in-data-[layout=newspaper]:justify-center in-data-[layout=newspaper]:gap-0.5"
    >
      <Toggle
        pressed={selected.size === 0}
        onPressedChange={() => {
          track("topic_filter", { tag: "all", from: "nav" });
          for (const name of selected) onToggle(name);
        }}
        className="chip"
      >
        <Bi vi="Tất cả" en="All" inline />
        <span className="chip-count">
          {categories.reduce((sum, c) => sum + c.count, 0)}
        </span>
      </Toggle>
      {categories.map((c) => {
        const isSelected = selected.has(c.name);
        return (
          <Toggle
            key={c.name}
            pressed={isSelected}
            onPressedChange={() => {
              const tag = feedTag(c.name, names);
              if (tag) track("topic_filter", { tag, from: "nav" });
              onToggle(c.name);
            }}
            className="chip"
          >
            <CategoryLabel
              name={c.name}
              lang={lang}
              quiet={!isSelected}
              dot={isSelected}
              colored={false}
            />
            <span className="chip-count">{c.count}</span>
          </Toggle>
        );
      })}
    </nav>
  );
}
