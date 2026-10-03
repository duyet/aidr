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
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="font-serif text-xl font-medium tracking-tight">AI;DR</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {date} · {bullets.length} {lang === "vi" ? "tin" : "stories"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
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
