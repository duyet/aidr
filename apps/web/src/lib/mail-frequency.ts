/**
 * How often a subscriber gets mail, stored in `subscribers.frequency`.
 * - `daily`: the TL;DR digest each morning (column default).
 * - `weekly`: the weekly edition (`weekly_snapshots`, `/week/YYYY-Www`)
 *   once, on Monday morning local time, and no daily digest.
 * Shared by the Worker and the browser forms, so keep it dependency-free.
 */
export const MAIL_FREQUENCIES = ["daily", "weekly"] as const;

export type MailFrequency = (typeof MAIL_FREQUENCIES)[number];

export function normalizeMailFrequency(value: unknown): MailFrequency {
  return value === "weekly" ? "weekly" : "daily";
}
