import type { Lang, TldrBullet } from "../lib/types";

/**
 * Compact text-only AI;DR list that sits beside the day's video. No story
 * thumbnails: the video is the only image in the hero, so the list stays
 * scannable and fits the video's height (it scrolls inside on md+).
 */
export function DayBriefing({
  bullets,
  date,
  lang,
  topicByItemId,
  pathByItemId,
}: {
  bullets: TldrBullet[];
  date: string;
  lang: Lang;
  topicByItemId: Map<string, string>;
  pathByItemId: Map<string, string>;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="font-serif text-xl font-medium tracking-tight">AI;DR</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {date} · {bullets.length} {lang === "vi" ? "tin" : "stories"}
        </span>
      </header>
      <ol className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto overscroll-contain">
        {bullets.map((b, i) => {
          const id = b.item_ids?.[0];
          const topic = id ? topicByItemId.get(id) : undefined;
          const href = id ? pathByItemId.get(id) : undefined;
          const body = (
            <>
              <span className="w-5 shrink-0 pt-0.5 text-right font-serif text-sm tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span className="min-w-0">
                {topic && (
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-accent">
                    {topic}
                  </span>
                )}
                <span className="line-clamp-2 text-sm leading-snug">
                  {b.text}
                </span>
              </span>
            </>
          );
          const rowClass = "flex gap-3 px-4 py-2.5";
          return (
            <li key={`${i}-${id ?? ""}`}>
              {href ? (
                <a
                  href={href}
                  title={b.text}
                  className={`${rowClass} transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none`}
                >
                  {body}
                </a>
              ) : (
                <div className={rowClass}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
