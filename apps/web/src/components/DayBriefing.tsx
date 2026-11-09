import { DEFAULT_AIDR_LAYOUT } from "../lib/aidr-layout";
import type { Lang, TldrBullet } from "../lib/types";
import { TldrBulletList } from "./TldrBulletList";

/**
 * AI;DR list beside the day's video or card. Same rows as the homepage
 * digest (topic colours, keyword highlights, click opens the story dialog),
 * in one column that fits the hero's height (it scrolls inside on md+).
 */
export function DayBriefing({
  bullets,
  date,
  lang,
  topicByItemId,
  categoryByItemId,
  pathByItemId,
  tagsByItemId,
  imageByItemId,
}: {
  bullets: TldrBullet[];
  date: string;
  lang: Lang;
  topicByItemId: Map<string, string>;
  categoryByItemId: Map<string, string>;
  pathByItemId: Map<string, string>;
  tagsByItemId: Map<string, string[]>;
  imageByItemId: Map<string, string>;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="inline-flex items-center gap-1.5 font-mono text-[calc(11px*var(--reader-font-size,1))] font-medium uppercase tracking-[0.1em] text-accent">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-signal"
          />
          AI;DR
        </h2>
        <span className="font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase tracking-[0.1em] tabular-nums text-muted-foreground">
          {date} · {bullets.length} {lang === "vi" ? "tin" : "stories"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-1">
        <TldrBulletList
          shown={bullets}
          mid={bullets.length}
          layout={DEFAULT_AIDR_LAYOUT}
          numbered
          lang={lang}
          topicByItemId={topicByItemId}
          categoryByItemId={categoryByItemId}
          pathByItemId={pathByItemId}
          tagsByItemId={tagsByItemId}
          imageByItemId={imageByItemId}
        />
      </div>
    </section>
  );
}
