import { TrendingUp } from "lucide-react";
import type { CSSProperties } from "react";
import { feedTag } from "../lib/analytics/schema";
import { track } from "../lib/analytics/track";
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
  const tags = trending.map((t) => t.tag);

  if (trending.length === 0) return null;
  return (
    <div
      ref={scrollRef}
      className="edge-fade-x scrollbar-hide flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-0.5 pt-1.5 pb-3"
    >
      <span className="mr-1 flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
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
              const tag = next ? feedTag(next, tags) : undefined;
              if (tag) track("topic_filter", { tag, from: "trending" });
              onSelectTag(next);
            }}
            aria-pressed={selected}
            className={`topic-colored inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color] duration-150 ${
              selected
                ? "border-current bg-muted"
                : "border-border hover:border-current"
            }`}
            style={
              {
                "--tc-light": color.light,
                "--tc-dark": color.dark,
              } as CSSProperties
            }
          >
            {t.tag}
            {/* topic-muted, not an opacity utility: element opacity blends the
                count toward whatever background is behind the chip, so the same
                class rendered a different (failing) ratio on every reader
                background. The token keeps the hue and the AA floor. */}
            <span className="topic-muted text-xs tabular-nums">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
