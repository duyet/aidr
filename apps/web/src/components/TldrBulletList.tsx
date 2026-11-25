import type { CSSProperties } from "react";
import { useState } from "react";
import type { AidrLayout } from "../lib/aidr-layout";
import { storyPath } from "../lib/slug";
import { categoryColor, isKnownCategory, topicColor } from "../lib/topic-color";
import type { Lang, TldrBullet } from "../lib/types";
import { KeywordText } from "./KeywordText";
import { StoryDialog } from "./StoryDialog";
import { TldrBulletRow } from "./TldrBulletRow";

export function TldrBulletList({
  shown,
  rows = 2,
  layout,
  numbered,
  lang,
  singleColumn = false,
  topicByItemId,
  categoryByItemId,
  pathByItemId,
  tagsByItemId,
  imageByItemId,
  secondTextByItemId,
}: {
  shown: TldrBullet[];
  /** Lines a title may take before it is clipped. */
  rows?: 2 | 3;
  layout: AidrLayout;
  numbered: boolean;
  lang: Lang;
  /** One column whatever the columns pref says (narrow slots). */
  singleColumn?: boolean;
  topicByItemId?: Map<string, string>;
  /** Raw category per story, used when a bullet has no topic tag. */
  categoryByItemId?: Map<string, string>;
  pathByItemId?: Map<string, string>;
  tagsByItemId?: Map<string, string[]>;
  imageByItemId?: Map<string, string>;
  /** The other language's title per story id, from that language's own
   * bullets. Present only in bilingual mode. */
  secondTextByItemId?: Map<string, string>;
}) {
  const [openBullet, setOpenBullet] = useState<{
    itemId: string;
    relatedIds: string[];
  } | null>(null);
  const secondLang: Lang = lang === "vi" ? "en" : "vi";

  return (
    <>
      <ol
        // Line height (here) and row padding (TldrBulletRow) follow the
        // reader Density pref, the same vars StoryRow uses, so the AI;DR
        // card tightens and loosens with the feed. Hairlines split the
        // rows; the rank numbers are drawn by the row, not ::marker.
        className="tldr-grid list-none pl-0 leading-[calc(var(--reader-leading,1.55)_-_0.175)]"
        style={
          singleColumn ? ({ "--tldr-cols": 1 } as CSSProperties) : undefined
        }
      >
        {shown.map((b, i) => {
          const n = i + 1;
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
          const secondText = primaryId
            ? secondTextByItemId?.get(primaryId)
            : undefined;
          const row = (
            <TldrBulletRow
              layout={layout}
              n={n}
              thumbSrc={thumbSrc}
              thumbItemId={thumbItemId}
              itemId={primaryId}
              lang={lang}
              fullText={b.text}
              second={
                secondText ? { text: secondText, lang: secondLang } : undefined
              }
              linked={Boolean(primaryId)}
              numbered={numbered}
              rows={rows}
              priority={n <= 6}
            >
              {tag && (
                <span className="mr-2 inline-flex items-baseline gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="topic-dot size-1.5 shrink-0 self-center rounded-full"
                  />
                  {tag}
                </span>
              )}
              <KeywordText text={b.text} tags={itemTags} />
              {otherIds.length > 0 && (
                <span className="ml-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                  +{otherIds.length}
                </span>
              )}
            </TldrBulletRow>
          );
          return (
            <li
              key={b.text}
              className="border-b border-border"
              style={
                color
                  ? ({
                      "--tc-light": color.light,
                      "--tc-dark": color.dark,
                    } as CSSProperties)
                  : undefined
              }
            >
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
