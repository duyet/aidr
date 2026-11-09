import { type ReactElement, type Ref, useId } from "react";
import { recordRead } from "../../lib/analytics/reads";
import { track } from "../../lib/analytics/track";
import type { FeedItem, Lang } from "../../lib/types";
import { SourceRow } from "../story/StorySources";
import { splitSources } from "./lib";

/**
 * Sources, kept compact: main sources as small pills, then the
 * supporting and discussion sources behind "+ N more" with their time
 * and quote. The section is the `S` shortcut's target.
 */
export function StorySourceLine({
  item,
  lang,
  sectionRef,
}: {
  item: FeedItem;
  lang: Lang;
  sectionRef?: Ref<HTMLElement>;
}): ReactElement | null {
  const headingId = useId();
  const { main, more } = splitSources(item);
  if (main.length === 0 && more.length === 0) return null;
  const vi = lang === "vi";
  const onOpen = () => {
    track("source_click", { item_id: item.id, placement: "sources" });
    recordRead(item.id, "outbound");
  };

  return (
    <section
      ref={sectionRef}
      id="sources"
      aria-labelledby={headingId}
      tabIndex={-1}
      data-kb=""
      className="grid gap-1 rounded-md"
    >
      <h2
        id={headingId}
        className="font-mono text-[calc(10px*var(--reader-font-size,1))] uppercase tracking-[0.1em] text-muted-foreground"
      >
        {vi ? "Nguồn" : "Sources"}
      </h2>
      {main.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-foreground">
          {main.map((s) => (
            <li key={s.key} className="min-w-0 [overflow-wrap:anywhere]">
              {s.href ? (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.quote ?? undefined}
                  onClick={onOpen}
                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[calc(12px*var(--reader-font-size,1))] font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  {s.label}
                </a>
              ) : (
                <span
                  title={s.quote ?? undefined}
                  className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[calc(12px*var(--reader-font-size,1))] font-medium"
                >
                  {s.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center rounded-full bg-muted/60 px-2 py-0.5 text-[calc(12px*var(--reader-font-size,1))] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
            {vi ? `+ ${more.length} nguồn khác` : `+ ${more.length} more`}
          </summary>
          <ol className="mt-1 list-none space-y-1 [&_li]:text-[calc(12px*var(--reader-font-size,1))]">
            {more.map((source, index) => (
              <SourceRow
                key={`${source.kind}-${source.url ?? source.author ?? "source"}-${index}`}
                source={source}
                lang={lang}
                itemId={item.id}
              />
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
