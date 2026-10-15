import type { DbReader } from "./db";

export const EXT_EVENTS_WINDOW_DAYS = 28;

export interface ExtDay {
  day: string;
  opens: number;
}

export interface ExtChannel {
  name: string;
  clicks: number;
}

export interface SystemExtEvents {
  window_days: number;
  total_opens: number;
  by_day: ExtDay[];
  by_channel: ExtChannel[];
}

const DAY_SQL = `SELECT day, SUM(count) AS opens FROM ext_events
  WHERE event = 'page_view' AND day >= date('now', ?1)
  GROUP BY day ORDER BY day DESC`;
const CHANNEL_SQL = `SELECT key AS name, SUM(count) AS clicks FROM ext_events
  WHERE event = 'channel_click' AND day >= date('now', ?1)
  GROUP BY key ORDER BY clicks DESC, name`;

function empty(): SystemExtEvents {
  return {
    window_days: EXT_EVENTS_WINDOW_DAYS,
    total_opens: 0,
    by_day: [],
    by_channel: [],
  };
}

export async function loadSystemExtEvents(
  db: DbReader
): Promise<SystemExtEvents> {
  const offset = `-${EXT_EVENTS_WINDOW_DAYS - 1} days`;
  let batch: D1Result[];
  try {
    batch = await db.batch([
      db.prepare(DAY_SQL).bind(offset),
      db.prepare(CHANNEL_SQL).bind(offset),
    ]);
  } catch (e) {
    // Before migration 0068 the card shows "no opens", not a 500.
    if (String(e).includes("no such table")) return empty();
    throw e;
  }
  const byDay = (batch[0]?.results ?? []) as ExtDay[];
  return {
    window_days: EXT_EVENTS_WINDOW_DAYS,
    total_opens: byDay.reduce((sum, d) => sum + d.opens, 0),
    by_day: byDay,
    by_channel: (batch[1]?.results ?? []) as ExtChannel[],
  };
}
