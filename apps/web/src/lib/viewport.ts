/**
 * Keep the browser's default viewport fitting. StoryDialog, StoryThumb's
 * lightbox, StoryDetail's fixed selection control, and the shared UI Sheet
 * are existing fixed portals; they rely on the safe viewport rather than
 * opting the whole document into `viewport-fit=cover`.
 */
export const VIEWPORT_META_CONTENT = "width=device-width, initial-scale=1.0";
