import { CHANNELS } from "../src/lib/analytics/events.js";
import { isStoryId } from "./votes.js";

export const READ_KINDS = ["open", "outbound"] as const;
export type ReadKind = (typeof READ_KINDS)[number];

/** "web" is a visit that arrived with no ref or utm. */
export const READ_CHANNELS = [...CHANNELS, "web"] as const;
export type ReadChannel = (typeof READ_CHANNELS)[number];

/** Per (item, day, channel, kind) ceiling. The only abuse control that
 * stores no identifier; `readFactor` saturates well below it anyway. */
export const READ_ROW_CAP = 2000;

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

/** The status `POST /api/read` answers with for one beacon. A text/plain
 * POST needs no CORS preflight, so another site could fire beacons here;
 * `Sec-Fetch-Site` drops those without counting. */
export async function decideRead(input: {
  ua: string | null;
  fetchSite: string | null;
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
  const outcome = await recordRead(input.db, read, input.day);
  return outcome === "unknown_item" ? 404 : 204;
}
