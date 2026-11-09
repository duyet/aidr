import type { CSSProperties } from "react";
import { useState } from "react";
import type { AidrLayout } from "../lib/aidr-layout";
import { storyPath } from "../lib/slug";
import { categoryColor, isKnownCategory, topicColor } from "../lib/topic-color";
import type { Lang, TldrBullet } from "../lib/types";
import { HighlightedText } from "./HighlightedText";
import { StoryDialog } from "./StoryDialog";
import { TldrBulletRow } from "./TldrBulletRow";

export function TldrBulletList({
  shown,
  mid,
  layout,
  numbered,
  lang,
  topicByItemId,
  categoryByItemId,
  pathByItemId,
  tagsByItemId,
  imageByItemId,
}: {
  shown: TldrBullet[];
  mid: number;
  layout: AidrLayout;
  numbered: boolean;
  lang: Lang;
  topicByItemId?: Map<string, string>;
  /** Raw category per story, used when a bullet has no topic tag. */
  categoryByItemId?: Map<string, string>;
  pathByItemId?: Map<string, string>;
  tagsByItemId?: Map<string, string[]>;
  imageByItemId?: Map<string, string>;
}) {
  const [openBullet, setOpenBullet] = useState<{
    itemId: string;
    relatedIds: string[];
  } | null>(null);

  const cols = [shown.slice(0, mid), shown.slice(mid)].filter(
    (col, ci) => ci === 0 || col.length > 0
  );

  return (
    <>
      <div
        className={
          cols.length > 1 ? "grid gap-x-10 md:grid-cols-2" : "grid gap-x-10"
        }
      >
        {cols.map((col, ci) => (
          <ol
            key={col[0]?.text ?? ci}
            start={ci * mid + 1}
            // Line height (here) and row padding (TldrBulletRow) follow the
            // reader Density pref, the same vars StoryRow uses, so the AI;DR
            // card tightens and loosens with the feed. Hairlines split the
            // rows; the rank numbers are drawn by the row, not ::marker.
            className={`list-none divide-y divide-border pl-0 leading-[calc(var(--reader-leading,1.55)_-_0.175)] ${
              ci > 0 ? "border-t border-border md:border-t-0" : ""
            }`}
          >
            {col.map((b, i) => {
              const n = ci * mid + i + 1;
              const primaryId = b.item_ids?.[0];
              const otherIds = (b.item_ids ?? []).slice(1);
              const tag = primaryId ? topicByItemId?.get(primaryId) : undefined;
              const category = primaryId
                ? categoryByItemId?.get(primaryId)
                : undefined;
              const primaryTags = primaryId
                ? (tagsByItemId?.get(primaryId) ?? [])
                : [];
              const categoryTopic =
                primaryTags.length === 0
                  ? (category ?? (isKnownCategory(tag) ? tag : null))
                  : null;
              const color = tag
                ? categoryTopic
                  ? categoryColor(categoryTopic)
                  : topicColor(tag)
                : null;
              const itemTags = (b.item_ids ?? []).flatMap(
                (id) => tagsByItemId?.get(id) ?? []
              );
              const thumbSrc =
                b.image_url ??
                (primaryId ? imageByItemId?.get(primaryId) : undefined) ??
                null;
              const thumbItemId = b.image_item_id ?? primaryId;
              const highlighted = (
                <HighlightedText text={b.text} tags={itemTags} />
              );
              const row = (
                <TldrBulletRow
                  layout={layout}
                  n={n}
                  thumbSrc={thumbSrc}
                  thumbItemId={thumbItemId}
                  itemId={primaryId}
                  lang={lang}
                  fullText={b.text}
                  linked={Boolean(primaryId)}
                  numbered={numbered}
                  priority={n <= 6}
                >
                  {color && tag && (
                    <span
                      className="mr-2 inline-flex items-baseline gap-1.5 font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase tracking-[0.08em] text-muted-foreground"
                      style={
                        {
                          "--tc-light": color.light,
                          "--tc-dark": color.dark,
                        } as CSSProperties
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="topic-dot size-1.5 shrink-0 self-center rounded-full"
                      />
                      {tag}
                    </span>
                  )}
                  {highlighted}
                  {otherIds.length > 0 && (
                    <span className="ml-1.5 font-mono text-[calc(11px*var(--reader-font-size,1))] text-muted-foreground tabular-nums">
                      +{otherIds.length}
                    </span>
                  )}
                </TldrBulletRow>
              );
              return (
                <li key={b.text}>
                  {primaryId ? (
                    <a
                      href={
                        pathByItemId?.get(primaryId) ??
                        storyPath({ id: primaryId }, lang)
                      }
                      onClick={(e) => {
                        if (
                          e.button !== 0 ||
                          e.metaKey ||
                          e.ctrlKey ||
                          e.shiftKey ||
                          e.altKey
                        ) {
                          return;
                        }
                        e.preventDefault();
                        setOpenBullet({
                          itemId: primaryId,
                          relatedIds: otherIds,
                        });
                      }}
                      data-keynav=""
                      className="group block scroll-my-16 rounded-[6px] text-inherit no-underline"
                    >
                      {row}
                    </a>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ol>
        ))}
      </div>

      {openBullet && (
        <StoryDialog
          idPrefix={openBullet.itemId}
          relatedIds={openBullet.relatedIds}
          lang={lang}
          onClose={() => setOpenBullet(null)}
        />
      )}
    </>
  );
}
