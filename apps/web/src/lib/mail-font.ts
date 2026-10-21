/**
 * Digest email headline font, stored in `subscribers.mail_font`.
 * - `sans`: system sans everywhere (column default).
 * - `serif`: EB Garamond for the wordmark and headlines, system sans for text.
 * Shared by the Worker renderer and the browser forms, so keep it dependency-free.
 */
export const MAIL_FONTS = ["sans", "serif"] as const;

export type MailFont = (typeof MAIL_FONTS)[number];

export function normalizeMailFont(value: unknown): MailFont {
  return MAIL_FONTS.includes(value as MailFont) ? (value as MailFont) : "sans";
}
