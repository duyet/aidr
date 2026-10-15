export type MailStat = "sent" | "failed" | "unsubscribed";

const COLUMN: Record<MailStat, string> = {
  sent: "sent",
  failed: "failed",
  unsubscribed: "unsubscribed",
};

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isMissingTable(error: unknown): boolean {
  return /no such table|has no table|unknown table/i.test(String(error));
}

/** Adds one to today's (UTC) counter for `lang`. Counting must never stop a
 *  send or an unsubscribe, so a failed write is logged and dropped; before
 *  migration 0069 the table is missing and that is silent. Callers count only
 *  on a state transition (see ALGORITHM.md section 11), so a retry of the
 *  same send does not reach this twice. */
export async function recordMailStat(
  db: Pick<D1Database, "prepare">,
  stat: MailStat,
  lang: string,
  now = Date.now()
): Promise<void> {
  const column = COLUMN[stat];
  try {
    await db
      .prepare(
        `INSERT INTO mail_daily_stats (date, lang, ${column}) VALUES (?, ?, 1)
         ON CONFLICT (date, lang) DO UPDATE SET ${column} = ${column} + 1`
      )
      .bind(utcDay(now), lang === "en" ? "en" : "vi")
      .run();
  } catch (error) {
    if (!isMissingTable(error))
      console.error("mail stats write failed:", error);
  }
}
