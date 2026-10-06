import { sha256Hex } from "./hash.js";

export type RateLimitColumn = "user_id" | "ip_hash";

export interface RateLimitQuery {
  sql: string;
  params: unknown[];
}

/**
 * Pure query builder: counts rows in `table` matching `column = key` whose
 * `created_at` falls within the last `windowSec` seconds of `now`
 * (defaults to `Date.now()`, epoch ms — every `created_at` column this is
 * used against is stored in ms, matching `Date.now()` at insert time).
 */
export function buildRateLimitQuery(args: {
  table: string;
  column: RateLimitColumn;
  key: string;
  windowSec: number;
  now?: number;
}): RateLimitQuery {
  const now = args.now ?? Date.now();
  const since = now - args.windowSec * 1000;
  return {
    sql: `SELECT COUNT(*) as count FROM ${args.table} WHERE ${args.column} = ? AND created_at >= ?`,
    params: [args.key, since],
  };
}

/** Thin executor around buildRateLimitQuery: returns true when `key` has
 * already hit or exceeded `limit` within the window (i.e. the caller
 * should be blocked). */
export async function checkRateLimit(
  db: D1Database,
  args: {
    table: string;
    column: RateLimitColumn;
    key: string;
    windowSec: number;
    limit: number;
    now?: number;
  }
): Promise<boolean> {
  const { sql, params } = buildRateLimitQuery(args);
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first<{ count: number }>();
  return (row?.count ?? 0) >= args.limit;
}

/** Hashes a client IP for storage/lookup. Callers must never persist or
 * compare the raw IP — this is the only sanctioned way to turn one into
 * an `ip_hash` value. */
export async function hashIp(ip: string): Promise<string> {
  return sha256Hex(ip);
}

export const ONE_DAY_SEC = 24 * 60 * 60;

/** Retention for `subscribe_attempts`: subscribe, anonymous MCP reads and
 * failed admin auth only ever insert, so without this the table grows without
 * a bound. Every rate-limit window here is at most ONE_DAY_SEC, so a row older
 * than that cannot affect any count. Never throws — the table is absent in
 * some envs/stubs, the same way the inserts tolerate it. */
export async function pruneSubscribeAttempts(
  db: D1Database,
  nowMs = Date.now()
): Promise<void> {
  try {
    await db
      .prepare("DELETE FROM subscribe_attempts WHERE created_at < ?")
      .bind(nowMs - ONE_DAY_SEC * 1000)
      .run();
  } catch {
    // subscribe_attempts table may be absent in test stubs
  }
}

/** Bilingual (EN / VI) rate-limit messages for the UI, in the "Bạn gửi quá
 * nhanh — thử lại sau" style the product asked for. */
export const RATE_LIMIT_MESSAGES = {
  pending:
    "Too many pending items awaiting review — please wait before submitting more. / Bạn có quá nhiều mục đang chờ duyệt — vui lòng đợi trước khi gửi thêm.",
  daily:
    "You're submitting too fast — try again later. / Bạn gửi quá nhanh — thử lại sau.",
  ip: "Too many submissions from this network today — try again tomorrow. / Có quá nhiều lượt gửi từ mạng này hôm nay — vui lòng thử lại vào ngày mai.",
} as const;
