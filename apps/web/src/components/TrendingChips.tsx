import { Toggle } from "@ui-sdk/react/toggle";
import { TrendingUp } from "lucide-react";
import type { CSSProperties } from "react";
import { feedTag } from "../lib/analytics/schema";
import { track } from "../lib/analytics/track";
import { topicColor } from "../lib/topic-color";

/** Rows the rail lists; the feed can carry up to 100 tags. */
const TRENDING_LIMIT = 8;

/** The right rail's "Trending" list: one row per tag with its story count.
 * A row filters the feed to that tag; pressing it again clears the filter. */
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
  const tags = trending.map((t) => t.tag);
  const isSelected = (tag: string) =>
    selectedTag !== null && selectedTag.toLowerCase() === tag.toLowerCase();
  // A selected tag past the cut stays listed, so it can be cleared.
  const shown = trending.filter(
    (t, i) => i < TRENDING_LIMIT || isSelected(t.tag)
  );

  if (trending.length === 0) return null;
  return (
    <section aria-label={label}>
      <h3 className="mb-3.5 flex items-center gap-[7px] text-[12.5px] font-bold uppercase tracking-[0.07em] text-foreground">
        <TrendingUp className="size-[15px]" aria-hidden />
        {label}
      </h3>
      <div className="flex flex-col">
        {shown.map((t) => {
          const selected = isSelected(t.tag);
          const color = topicColor(t.tag);
          return (
            <Toggle
              key={t.tag}
              pressed={selected}
              onPressedChange={() => {
                const next = selected ? null : t.tag;
                const tag = next ? feedTag(next, tags) : undefined;
                if (tag) track("topic_filter", { tag, from: "trending" });
                onSelectTag(next);
              }}
              style={
                {
                  "--tc-light": color.light,
                  "--tc-dark": color.dark,
                } as CSSProperties
              }
              className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-[9px] text-left text-[15px] leading-[calc(var(--reader-leading,1.55)_-_0.175)] hover:bg-muted data-pressed:bg-muted"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="topic-dot size-2 shrink-0 rounded-full"
                />
                <span className="topic-ink min-w-0 truncate font-normal">
                  {t.tag}
                </span>
              </span>
              {/* topic-muted, not an opacity utility: element opacity blends the
                  count toward whatever background is behind the row, so the same
                  class rendered a different (failing) ratio on every reader
                  background. The token keeps the hue and the AA floor. */}
              <span className="topic-muted text-[12.5px] tabular-nums">
                {t.count}
              </span>
            </Toggle>
          );
        })}
      </div>
    </section>
  );
}
