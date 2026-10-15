import type { DbReader } from "./db";

export const MAIL_STATS_WINDOW_DAYS = 28;

export interface MailLangStats {
  lang: string;
  sent: number;
  failed: number;
  unsubscribed: number;
}

export interface SystemMailStats {
  window_days: number;
  by_lang: MailLangStats[];
}

const SQL = `SELECT lang, SUM(sent) AS sent, SUM(failed) AS failed,
    SUM(unsubscribed) AS unsubscribed
  FROM mail_daily_stats WHERE date >= date('now', ?1)
  GROUP BY lang ORDER BY lang`;

export async function loadSystemMailStats(
  db: DbReader
): Promise<SystemMailStats> {
  const offset = `-${MAIL_STATS_WINDOW_DAYS - 1} days`;
  try {
    const { results } = await db.prepare(SQL).bind(offset).all();
    return {
      window_days: MAIL_STATS_WINDOW_DAYS,
      by_lang: (results as unknown as MailLangStats[]).map((r) => ({
        lang: r.lang,
        sent: Number(r.sent) || 0,
        failed: Number(r.failed) || 0,
        unsubscribed: Number(r.unsubscribed) || 0,
      })),
    };
  } catch (e) {
    // Before migration 0069 the card shows its empty state, not a 500.
    if (String(e).includes("no such table")) {
      return { window_days: MAIL_STATS_WINDOW_DAYS, by_lang: [] };
    }
    throw e;
  }
}
