/**
 * Digest email layouts, stored in `subscribers.mail_format`.
 * - `no-images`: designed card, no story or video images.
 * - `design`: a large image on the lead story, an 84px thumbnail per other
 *   story (column default).
 * - `large`: a large image on every story.
 * - `text`: plain text list.
 * Shared by the Worker renderer and the browser forms, so keep it dependency-free.
 */
export const MAIL_FORMATS = ["no-images", "design", "large", "text"] as const;

export type MailFormat = (typeof MAIL_FORMATS)[number];

export function normalizeMailFormat(value: unknown): MailFormat {
  return MAIL_FORMATS.includes(value as MailFormat)
    ? (value as MailFormat)
    : "design";
}

/** Whether the layout shows story images, so the send path must load them. */
export function mailFormatHasImages(format: MailFormat): boolean {
  return format === "design" || format === "large";
}
