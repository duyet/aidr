import { type ReactElement, type Ref, useId } from "react";
import { recordRead } from "../../lib/analytics/reads";
import { track } from "../../lib/analytics/track";
import type { FeedItem, Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { SourceRow } from "../story/StorySources";
import { splitSources } from "./lib";

const CHIP =
  "inline-flex min-h-7 items-center rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground";

/** The section is the `S` shortcut's target and the `#sources` anchor. */
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
      className="grid gap-2 rounded-md text-sm"
    >
      <h2 id={headingId} className="sr-only">
        <Bi vi="Nguồn" en="Sources" inline />
      </h2>
      {main.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {main.map((s) => (
            <li key={s.key} className="min-w-0">
              {s.href ? (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.quote ?? undefined}
                  onClick={onOpen}
                  className={CHIP}
                >
                  {s.label}
                </a>
              ) : (
                <span title={s.quote ?? undefined} className={CHIP}>
                  {s.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <details className="group">
          <summary
            className={`${CHIP} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          >
            <Bi
              vi={`+ ${more.length} nguồn khác`}
              en={`+ ${more.length} more`}
              inline
            />
          </summary>
          <ol className="mt-2 list-none space-y-1">
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
