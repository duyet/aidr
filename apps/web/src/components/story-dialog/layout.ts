/** Shared class hooks for the story reader drawer and the image zoom.
 *
 * The drawer is a side panel from 700px and a bottom sheet under it
 * (use-dialog-side.ts). The image zoom keeps the lightbox hooks below.
 */
export const STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS =
  "story-dialog-overlay fixed inset-0 z-[1200] flex items-center justify-center overflow-hidden";

export const STORY_DIALOG_LIGHTBOX_PANEL_CLASS =
  "story-dialog-lightbox-panel relative max-w-[min(960px,100%)]";

export const STORY_DIALOG_LIGHTBOX_IMAGE_CLASS =
  "story-dialog-lightbox-image w-auto max-w-full rounded-xl object-contain";

export const STORY_DIALOG_CLOSE_BUTTON_CLASS =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full motion-reduce:transition-none";

/** The drawer sheet. Rendered outside `.app-shell`, so it carries its own
 * `app-shell news-content` classes and the reader data attributes
 * (StoryDialog sets them). */
const STORY_DIALOG_PANEL_CLASS =
  "story-drawer app-shell news-content flex min-w-0 flex-col overflow-hidden bg-background text-foreground shadow-xl outline-none data-[side=right]:h-full data-[side=right]:rounded-l-2xl data-[side=bottom]:max-h-[92dvh] data-[side=bottom]:w-full data-[side=bottom]:rounded-t-2xl";

const SINGLE_WIDTH_CLASS = "data-[side=right]:w-[min(520px,100vw)]";
const BILINGUAL_WIDTH_CLASS = "data-[side=right]:w-[min(980px,100vw)]";

export const STORY_DIALOG_BODY_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pt-1 pb-6";

export const STORY_DIALOG_HEADER_CLASS = "shrink-0 px-5 pt-2 pb-3";

export function isBilingualDialog(
  preference: boolean,
  hasVi: boolean
): boolean {
  return preference && hasVi;
}

export function storyDialogPanelClass(sideBySide: boolean): string {
  return `${STORY_DIALOG_PANEL_CLASS} ${
    sideBySide ? BILINGUAL_WIDTH_CLASS : SINGLE_WIDTH_CLASS
  }`;
}
