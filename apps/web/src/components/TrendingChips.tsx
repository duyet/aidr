import { track } from "@aidr/ui/track";
import { TrendingUp } from "lucide-react";
import type { CSSProperties } from "react";
import { topicColor } from "../lib/topic-color";
import { useHorizontalScroll } from "../lib/use-horizontal-scroll";

export function TrendingChips({
  trending,
  label,
  selectedTag,
  onSelectTag,
}: {
  trending: { tag: string; count: number }[];
  label: string;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}) {
  const scrollRef = useHorizontalScroll<HTMLDivElement>();

  if (trending.length === 0) return null;
  return (
    <div
      ref={scrollRef}
      className="edge-fade-x scrollbar-hide flex items-center gap-2 overflow-x-auto whitespace-nowrap py-3"
    >
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {label}
      </span>
      {trending.map((t) => {
        const selected =
          selectedTag !== null &&
          selectedTag.toLowerCase() === t.tag.toLowerCase();
        const color = topicColor(t.tag);
        return (
          <button
            key={t.tag}
            type="button"
            onClick={() => {
              const next = selected ? null : t.tag;
              if (next) track("topic_filter", { tag: next });
              onSelectTag(next);
            }}
            aria-pressed={selected}
            className={`topic-colored flex shrink-0 items-baseline gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-[border-color,opacity] duration-150 ${
              selected
                ? "border-current bg-muted/40"
                : "border-border/80 hover:border-current"
            }`}
            style={
              {
                "--tc-light": color.light,
                "--tc-dark": color.dark,
              } as CSSProperties
            }
          >
            {t.tag}
            <span className="text-xs font-semibold opacity-70">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
