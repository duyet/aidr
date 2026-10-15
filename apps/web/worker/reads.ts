import { CHANNELS } from "../src/lib/analytics/events.js";
import { isStoryId } from "./votes.js";

export const READ_KINDS = ["open", "outbound"] as const;
export type ReadKind = (typeof READ_KINDS)[number];

/** "web" is a visit that arrived with no ref or utm. */
export const READ_CHANNELS = [...CHANNELS, "web"] as const;
export type ReadChannel = (typeof READ_CHANNELS)[number];

/** Per (item, day, channel, kind) ceiling, a backstop behind the per-IP
 * limiter (`READ_LIMITER`) for a row nobody should reach. */
export const READ_ROW_CAP = 2000;

/** Reads only reorder on-site lists (`readFactor`), never the stored
 * `rank_score`. Every public post (edition, Telegram trending, Facebook)
 * ranks on `rank_score`, and a read is anonymous: a script on rotating IPs
 * can fake them. The boost starts flat, so one client's one or two counts
 * move a story a place or two, and tops out at x1.3 (half of it by 200). */
export const READER_READ_MAX_BOOST = 0.3;
export const READER_READ_HALF = 200;

/** Multiplier on `rank_score` for on-site order: 1 with no reads. */
export function readFactor(readCount = 0): number {
  if (!Number.isFinite(readCount) || readCount <= 0) return 1;
  return (
    1 + (READER_READ_MAX_BOOST * readCount) / (readCount + READER_READ_HALF)
  );
}

/** Today's and yesterday's UTC reads per published story, as `read_count`
 * on `items i`. A read on an id that was later merged counts for its
 * canonical. */
export const READ_COUNT_COLUMN =
  "COALESCE(read_sum.read_count, 0) AS read_count";
export const READ_COUNT_JOIN_I = `LEFT JOIN (
    SELECT COALESCE(m.duplicate_of, r.item_id) AS item_id,
           SUM(r.count) AS read_count
    FROM item_reads r
    LEFT JOIN items m ON m.id = r.item_id AND m.status = 'merged'
    WHERE r.day >= date('now', '-1 day')
    GROUP BY 1
  ) AS read_sum ON read_sum.item_id = i.id`;

let readsTableReady: boolean | null = null;

/** Whether `item_reads` exists, so the feed still loads before 0065. */
export async function itemReadsTableReady(db: {
  prepare(sql: string): { all(): Promise<unknown> };
}): Promise<boolean> {
  if (readsTableReady !== null) return readsTableReady;
  try {
    await db.prepare("SELECT item_id FROM item_reads LIMIT 1").all();
  } catch {
    return false;
  }
  readsTableReady = true;
  return true;
}

export interface ReadBeacon {
  itemId: string;
  kind: ReadKind;
  channel: ReadChannel;
}

function oneOf<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === "string" && (values as readonly string[]).includes(value)
  );
}

export function parseReadBeacon(raw: unknown): ReadBeacon | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { item_id, kind, channel } = raw as Record<string, unknown>;
  if (typeof item_id !== "string" || !isStoryId(item_id)) return null;
  if (!oneOf(READ_KINDS, kind) || !oneOf(READ_CHANNELS, channel)) return null;
  return { itemId: item_id, kind, channel };
}

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|python|curl|wget|httpclient|facebookexternalhit|preview|fetch|monitor/i;

export function isBotUserAgent(ua: string | null): boolean {
  return !ua || BOT_UA.test(ua);
}

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export type ReadOutcome = "counted" | "unknown_item" | "capped";

export async function recordRead(
  db: D1Database,
  read: ReadBeacon,
  day: string
): Promise<ReadOutcome> {
  const item = await db
    .prepare("SELECT 1 FROM items WHERE id = ? AND status = 'published'")
    .bind(read.itemId)
    .first();
  if (!item) return "unknown_item";
  const result = await db
    .prepare(
      `INSERT INTO item_reads (item_id, day, channel, kind, count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(item_id, day, channel, kind) DO UPDATE SET
         count = count + 1
       WHERE item_reads.count < ?`
    )
    .bind(read.itemId, day, read.channel, read.kind, READ_ROW_CAP)
    .run();
  return result.meta.changes === 0 ? "capped" : "counted";
}

/** The key `READ_LIMITER` allows once a minute. aidr stores nothing;
 * Cloudflare keeps the counter at that location for the period. */
function readLimitKey(ip: string, read: ReadBeacon): string {
  return `${ip}|${read.itemId}|${read.kind}`;
}

/** The status `POST /api/read` answers with for one beacon. A text/plain
 * POST needs no CORS preflight, so another site could fire beacons here;
 * `Sec-Fetch-Site` drops those without counting. Both that header and the
 * user agent are spoofable by a script, so the per-IP limiter is what
 * bounds one client. */
export async function decideRead(input: {
  ua: string | null;
  fetchSite: string | null;
  ip: string | null;
  limiter: RateLimit | undefined;
  body: string;
  db: D1Database;
  day: string;
}): Promise<204 | 400 | 404> {
  if (isBotUserAgent(input.ua) || input.fetchSite === "cross-site") return 204;
  let raw: unknown;
  try {
    raw = JSON.parse(input.body);
  } catch {
    return 400;
  }
  const read = parseReadBeacon(raw);
  if (!read) return 400;
  if (input.limiter) {
    if (!input.ip) return 204;
    const { success } = await input.limiter.limit({
      key: readLimitKey(input.ip, read),
    });
    if (!success) return 204;
  }
  const outcome = await recordRead(input.db, read, input.day);
  return outcome === "unknown_item" ? 404 : 204;
}
