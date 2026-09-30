/**
 * Digest email layouts, stored in `subscribers.mail_format`.
 * - `no-images`: designed card, no story images.
 * - `design`: one hero image plus a small thumbnail per story (column default).
 * - `large`: one large image per story, no separate hero.
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
