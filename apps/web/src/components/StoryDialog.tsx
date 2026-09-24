import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localizedTitle } from "../lib/display-title";
import { fetchFeedOnce, getCachedFeed } from "../lib/feed-cache";
import { usePrefs } from "../lib/prefs";
import type { FeedItem, Lang } from "../lib/types";
import { StoryDetail } from "./StoryDetail";
import { DialogHeader } from "./story-dialog/DialogHeader";
import {
  isBilingualDialog,
  STORY_DIALOG_BODY_CLASS,
  STORY_DIALOG_HEADER_CLASS,
  STORY_DIALOG_OVERLAY_CLASS,
  storyDialogPanelClass,
} from "./story-dialog/layout";
import { RelatedList } from "./story-dialog/RelatedList";
import { useDialogLifecycle } from "./story-dialog/use-dialog-lifecycle";
import { useStoryItem } from "./story-dialog/use-story-item";

/**
 * Modal that fetches and renders a single story by id prefix. No runtime deps:
 * a fixed overlay + centered panel, Escape/backdrop/× to close, a body
 * scroll lock while open, and focus containment (focuses the panel on
 * open, restores focus to the trigger on close).
 */
export function StoryDialog({
  idPrefix,
  relatedIds,
  lang,
  onClose,
}: {
  idPrefix: string;
  /** Other story ids a TL;DR bullet synthesized alongside this one, shown
   * as a compact "also in this story" list below the main content. */
  relatedIds?: string[];
  lang: Lang;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState(idPrefix);
  const [feed, setFeed] = useState(() => getCachedFeed());
  const { prefs, setPrefs } = usePrefs();
  const item = useStoryItem(activeId);
  const hasVi = Boolean(item?.title_vi || item?.summary_vi);
  const bilingual = isBilingualDialog(prefs.bilingualDialog, hasVi);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useDialogLifecycle(onClose, overlayRef);

  useEffect(() => {
    setActiveId(idPrefix);
  }, [idPrefix]);

  useEffect(() => {
    if (relatedIds?.length && !feed) {
      fetchFeedOnce().then((res) => {
        if (res) setFeed(res);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const relatedItems = (relatedIds ?? [])
    .filter((id) => id !== activeId)
    .map((id) => {
      const allItems = feed?.days.flatMap((d) => d.items) ?? [];
      return allItems.find((it) => it.id.startsWith(id));
    })
    .filter((it): it is FeedItem => Boolean(it));

  const { text: title, fallbackFromEnglish } = item
    ? localizedTitle(item, lang)
    : { text: undefined as string | undefined, fallbackFromEnglish: false };

  const overlay = (
    <div ref={overlayRef} className={STORY_DIALOG_OVERLAY_CLASS}>
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        tabIndex={-1}
        aria-label={lang === "vi" ? "Đóng" : "Close"}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Story"}
        tabIndex={-1}
        className={storyDialogPanelClass(bilingual)}
      >
        <div className={STORY_DIALOG_HEADER_CLASS}>
          <DialogHeader
            item={item}
            title={title}
            fallbackFromEnglish={fallbackFromEnglish}
            hasVi={hasVi}
            bilingual={bilingual}
            lang={lang}
            onToggleBilingual={() => setPrefs({ bilingualDialog: !bilingual })}
            onClose={onClose}
          />
        </div>

        <div className={STORY_DIALOG_BODY_CLASS}>
          {item === undefined && (
            <p className="text-sm text-muted-foreground">
              {lang === "vi" ? "Đang tải..." : "Loading..."}
            </p>
          )}
          {item === null && (
            <p className="text-sm text-muted-foreground">
              {lang === "vi" ? "Không tìm thấy tin." : "Story not found."}
            </p>
          )}
          {item && (
            <StoryDetail item={item} lang={lang} bilingual={bilingual} />
          )}

          {relatedItems.length > 0 && (
            <RelatedList
              items={relatedItems}
              lang={lang}
              onSelect={setActiveId}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
