import { localizedTitle } from "../../lib/display-title";
import { timeAgo } from "../../lib/lang";
import type { FeedItem, Lang } from "../../lib/types";
import { Bi } from "../Bi";

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
    <div className="mt-6">
      <p className="mb-1.5 text-[12.5px] font-bold tracking-[0.07em] text-foreground uppercase">
        <Bi vi="Cùng chủ đề" en="Also in this story" inline />
      </p>
      <ul className="space-y-0.5">
        {items.map((rel) => {
          const { text, fallbackFromEnglish } = localizedTitle(rel, lang);
          return (
            <li key={rel.id}>
              <button
                type="button"
                onClick={() => onSelect(rel.id)}
                className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted"
              >
                <span
                  className="min-w-0 flex-1 truncate"
                  lang={fallbackFromEnglish ? "en" : undefined}
                >
                  {text}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(rel.published_at, Date.now(), lang)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
