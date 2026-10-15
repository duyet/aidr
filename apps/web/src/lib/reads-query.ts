import type { DbReader } from "./db";

export const READS_WINDOW_DAYS = 28;

export interface ReadTotal {
  name: string;
  reads: number;
}

export interface CategoryReads extends ReadTotal {
  /** Distinct stories read in this category. */
  items: number;
}

export interface SystemReads {
  window_days: number;
  total: number;
  by_category: CategoryReads[];
  by_channel: ReadTotal[];
  by_kind: ReadTotal[];
}

const WINDOW = `FROM item_reads r JOIN items i ON i.id = r.item_id
  WHERE r.day >= date('now', ?1)`;

const CATEGORY_SQL = `SELECT COALESCE(i.category, 'Uncategorized') AS name,
    SUM(r.count) AS reads, COUNT(DISTINCT r.item_id) AS items
  ${WINDOW} GROUP BY name ORDER BY reads DESC, name`;
const CHANNEL_SQL = `SELECT r.channel AS name, SUM(r.count) AS reads
  ${WINDOW} GROUP BY name ORDER BY reads DESC, name`;
const KIND_SQL = `SELECT r.kind AS name, SUM(r.count) AS reads
  ${WINDOW} GROUP BY name ORDER BY reads DESC, name`;

function empty(): SystemReads {
  return {
    window_days: READS_WINDOW_DAYS,
    total: 0,
    by_category: [],
    by_channel: [],
    by_kind: [],
  };
}

export async function loadSystemReads(db: DbReader): Promise<SystemReads> {
  const offset = `-${READS_WINDOW_DAYS - 1} days`;
  let batch: D1Result[];
  try {
    batch = await db.batch([
      db.prepare(CATEGORY_SQL).bind(offset),
      db.prepare(CHANNEL_SQL).bind(offset),
      db.prepare(KIND_SQL).bind(offset),
    ]);
  } catch (e) {
    // Before migration 0064 the card shows "no reads", not a 500.
    if (String(e).includes("no such table")) return empty();
    throw e;
  }
  const [categories, channels, kinds] = batch.map((r) => r?.results ?? []);
  const byKind = kinds as ReadTotal[];
  return {
    window_days: READS_WINDOW_DAYS,
    total: byKind.reduce((sum, k) => sum + k.reads, 0),
    by_category: categories as CategoryReads[],
    by_channel: channels as ReadTotal[],
    by_kind: byKind,
  };
}
