import { Button } from "@ui-sdk/react/button";
import { Drawer, DrawerBackdrop, DrawerContent } from "@ui-sdk/react/drawer";
import { useCallback, useEffect, useRef, useState } from "react";
import { localizedTitle } from "../lib/display-title";
import { fetchFeedOnce, getCachedFeed } from "../lib/feed-cache";
import { loadErrorCopy } from "../lib/load-error";
import { readerCssVars, readerDataAttrs, usePrefs } from "../lib/prefs";
import type { FeedItem, Lang } from "../lib/types";
import { StoryDetail } from "./StoryDetail";
import { DialogHeader } from "./story-dialog/DialogHeader";
import {
  isBilingualDialog,
  STORY_DIALOG_BODY_CLASS,
  STORY_DIALOG_HEADER_CLASS,
  storyDialogPanelClass,
} from "./story-dialog/layout";
import { neighborId } from "./story-dialog/neighbors";
import { RelatedList } from "./story-dialog/RelatedList";
import { useDialogSide } from "./story-dialog/use-dialog-side";
import { useNeighborKeys } from "./story-dialog/use-neighbor-keys";
import { useStoryItem } from "./story-dialog/use-story-item";

/**
 * A story over the page: a side panel from 700px, a bottom sheet on a phone,
 * J and K to step through the day's stories. It mounts open, and the parent
 * unmounts it once it has closed. The drawer renders outside `.app-shell`,
 * so the sheet carries the reader prefs itself.
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
  const [open, setOpen] = useState(true);
  const [activeId, setActiveId] = useState(idPrefix);
  const [feed, setFeed] = useState(() => getCachedFeed(lang));
  const { prefs, setPrefs } = usePrefs();
  const side = useDialogSide();
  const { state, retry } = useStoryItem(activeId, lang);
  const item = state.status === "ready" ? state.item : undefined;
  const hasVi = Boolean(item?.title_vi || item?.summary_vi);
  const sideBySide = isBilingualDialog(prefs.bilingualDialog, hasVi);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveId(idPrefix);
  }, [idPrefix]);

  useEffect(() => {
    const cached = getCachedFeed(lang);
    setFeed(cached);
    if (relatedIds?.length && !cached) {
      void fetchFeedOnce(lang).then((res) => {
        if (res) setFeed(res);
      });
    }
  }, [lang, relatedIds]);

  const step = useCallback(
    async (direction: 1 | -1) => {
      if (!item) return;
      const source = feed ?? (await fetchFeedOnce(lang));
      const next = neighborId(source, item.id, direction);
      if (next) setActiveId(next);
    },
    [item, feed, lang]
  );
  useNeighborKeys(step);

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

  return (
    <Drawer
      open={open}
      side={side}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DrawerBackdrop className="bg-black/40" />
      <DrawerContent
        ref={panelRef}
        aria-label={title ?? "Story"}
        initialFocus="content"
        className={storyDialogPanelClass(sideBySide)}
        style={readerCssVars(prefs)}
        data-reader-font={prefs.font}
        {...readerDataAttrs(prefs)}
      >
        {side === "bottom" && (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border"
          />
        )}
        <div className={STORY_DIALOG_HEADER_CLASS}>
          <DialogHeader
            item={item}
            title={title}
            fallbackFromEnglish={fallbackFromEnglish}
            hasVi={hasVi}
            bilingual={sideBySide}
            lang={lang}
            onToggleBilingual={() => setPrefs({ bilingualDialog: !sideBySide })}
            onClose={() => setOpen(false)}
            onStep={(direction) => void step(direction)}
          />
        </div>

        <div className={STORY_DIALOG_BODY_CLASS}>
          {state.status === "loading" && (
            <p className="text-sm text-muted-foreground">
              {lang === "vi" ? "Đang tải..." : "Loading..."}
            </p>
          )}
          {state.status === "missing" && (
            <p className="text-sm text-muted-foreground">
              {lang === "vi" ? "Không tìm thấy tin." : "Story not found."}
            </p>
          )}
          {state.status === "failed" && (
            <div className="text-sm text-muted-foreground">
              <p role="alert">
                {lang === "vi"
                  ? "Không tải được tin."
                  : "The story could not be loaded."}
              </p>
              <Button
                onClick={() => {
                  // The button unmounts on retry; keep focus inside the dialog.
                  panelRef.current?.focus();
                  retry();
                }}
                className="btn-link mt-2"
              >
                {loadErrorCopy("story", lang).retry}
              </Button>
            </div>
          )}
          {item && (
            <StoryDetail
              item={item}
              lang={lang}
              bilingual={sideBySide}
              showVotes
            />
          )}

          {relatedItems.length > 0 && (
            <RelatedList
              items={relatedItems}
              lang={lang}
              onSelect={setActiveId}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
