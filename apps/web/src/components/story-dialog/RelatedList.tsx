import { localizedTitle } from "../../lib/display-title";
import { timeAgo } from "../../lib/lang";
import type { FeedItem, Lang } from "../../lib/types";

/** Compact "also in this story" list — the other stories a TL;DR bullet
 * was synthesized alongside, shown below the main content. */
export function RelatedList({
  items,
  lang,
  onSelect,
}: {
  items: FeedItem[];
  lang: Lang;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
        {lang === "vi" ? "Cùng chủ đề" : "Also in this story"}
      </p>
      <ul className="space-y-1">
        {items.map((rel) => (
          <li key={rel.id}>
            <button
              type="button"
              onClick={() => onSelect(rel.id)}
              className="flex w-full items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
            >
              <span
                className="min-w-0 flex-1 truncate"
                lang={
                  localizedTitle(rel, lang).fallbackFromEnglish
                    ? "en"
                    : undefined
                }
              >
                {localizedTitle(rel, lang).text}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {timeAgo(rel.published_at, Date.now(), lang)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
