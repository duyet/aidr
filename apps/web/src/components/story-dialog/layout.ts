/** Shared class hooks for the story reader modal.
 *
 * Width grows at the same breakpoints as the reader's two-column layout.
 * The panel height itself is defined in styles.css so it can use a vh
 * fallback before the dynamic-viewport declaration.
 */
export const STORY_DIALOG_OVERLAY_CLASS =
  "fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden p-4 sm:p-6 lg:p-8 2xl:p-10";

export const STORY_DIALOG_PANEL_CLASS =
  "story-dialog-panel relative flex min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-xl transition-[max-width]";

export const STORY_DIALOG_HEADER_CLASS =
  "sticky top-0 z-10 shrink-0 border-b border-border/70 bg-background p-5 sm:p-6 md:p-7";

export const STORY_DIALOG_BODY_CLASS =
  "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-5 sm:p-6 md:p-7";

const BILINGUAL_MAX_WIDTH_CLASS =
  "max-w-2xl sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[88rem]";
const SINGLE_MAX_WIDTH_CLASS =
  "max-w-2xl sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl";

/** Keep the two-language reader roomier without changing its content layout. */
export function storyDialogPanelClass(bilingual: boolean): string {
  return `${STORY_DIALOG_PANEL_CLASS} ${
    bilingual ? BILINGUAL_MAX_WIDTH_CLASS : SINGLE_MAX_WIDTH_CLASS
  }`;
}
