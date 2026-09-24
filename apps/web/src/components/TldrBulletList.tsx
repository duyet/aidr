import type { CSSProperties } from "react";
import { useState } from "react";
import type { AidrLayout } from "../lib/aidr-layout";
import { categoryColor, isKnownCategory, topicColor } from "../lib/topic-color";
import type { Lang, TldrBullet } from "../lib/types";
import { HighlightedText } from "./HighlightedText";
import { StoryDialog } from "./StoryDialog";
import { TldrBulletRow } from "./TldrBulletRow";

/** The two-column bullet list plus the story dialog opened from a bullet. */
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

  const cols = [shown.slice(0, mid), shown.slice(mid)];

  return (
    <>
      <div className="grid gap-x-10 md:grid-cols-2">
        {cols.map((col, ci) => (
          <ol
            key={col[0]?.text ?? ci}
            start={ci * mid + 1}
            className={
              numbered
                ? "list-decimal space-y-2 pl-6 leading-snug marker:text-muted-foreground"
                : "list-none space-y-2 pl-0 leading-snug"
            }
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
              const highlighted = (
                <HighlightedText text={b.text} tags={itemTags} />
              );
              const row = (
                <TldrBulletRow
                  layout={layout}
                  n={n}
                  thumbSrc={thumbSrc}
                  itemId={primaryId}
                  fullText={b.text}
                  linked={Boolean(primaryId)}
                  priority={n <= 6}
                >
                  {color && tag && (
                    <span
                      className={`${
                        categoryTopic ? "category-colored" : "topic-colored"
                      } mr-1.5 text-xs font-semibold uppercase tracking-wide`}
                      style={
                        {
                          "--tc-light": color.light,
                          "--tc-dark": color.dark,
                        } as CSSProperties
                      }
                    >
                      {tag}
                    </span>
                  )}
                  {highlighted}
                  {otherIds.length > 0 && (
                    <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
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
                        `/${primaryId.slice(0, 8)}`
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
                      className="group block text-inherit no-underline"
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
