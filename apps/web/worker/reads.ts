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

/** Reads only reorder the homepage within a day (`getFeed`'s `readOrder`),
 * never the stored `rank_score`, the edition, a post, RSS or the API's
 * membership. A read is anonymous and a script on one IP can drip one open a
 * minute past `READ_LIMITER`, so the factor counts opens only, caps each
 * story's day at `READ_DAY_CAP`, and stays near-linear below that cap: the
 * most any story gets is x1.03 (200 counted opens over the two-day window). */
export const READER_READ_MAX_BOOST = 0.15;
export const READER_READ_HALF = 800;
export const READ_DAY_CAP = 100;

/** Multiplier on `rank_score` for the homepage's in-day order: 1 with no reads. */
export function readFactor(readCount = 0): number {
  if (!Number.isFinite(readCount) || readCount <= 0) return 1;
  return (
    1 + (READER_READ_MAX_BOOST * readCount) / (readCount + READER_READ_HALF)
  );
}

/** Opens per published story today and yesterday UTC, each day capped at
 * `READ_DAY_CAP`, as `read_count` on `items i`. An open on an id that was
 * later merged counts for its canonical, inside that canonical's cap.
 * Outbound clicks are stored for /data but never order anything.
 * Correlated on `i.id` so each row reads its own `item_reads` primary-key
 * prefix. A grouped join scanned every row of today's reads once per feed
 * row (~175k rows read per homepage query). `+r.day` keeps the planner off
 * `idx_item_reads_day`, which would walk the whole day per row. */
export const READ_COUNT_COLUMN = `COALESCE((
    SELECT SUM(MIN(day_count, ${READ_DAY_CAP})) FROM (
      SELECT SUM(r.count) AS day_count
      FROM item_reads r
      WHERE r.item_id IN (
          SELECT i.id UNION ALL
          SELECT m.id FROM items m WHERE m.duplicate_of = i.id AND m.status = 'merged')
        AND +r.day >= date('now', '-1 day') AND r.kind = 'open'
      GROUP BY r.day
    )
  ), 0) AS read_count`;

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
