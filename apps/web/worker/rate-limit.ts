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

export interface InsertLimits {
  table: "submissions" | "translation_suggestions";
  pendingStatuses: readonly string[];
  userId: string | null;
  ipHash: string | null;
  pendingLimit: number;
  userDailyLimit: number;
  ipDailyLimit: number;
  now?: number;
}

export type ExceededLimit = "pending" | "daily" | "ip";

function pendingCountSql(args: InsertLimits): string {
  const statuses = args.pendingStatuses
    .map((status) => `'${status.replace(/'/g, "''")}'`)
    .join(", ");
  return `SELECT COUNT(*) AS count FROM ${args.table} WHERE user_id = ? AND status IN (${statuses})`;
}

/**
 * SQL predicate for `INSERT ... SELECT ... WHERE <predicate>`: true only while
 * the user is under the pending and daily caps and the IP is under its daily
 * cap. Counting and inserting in one statement closes the check-then-insert
 * race where parallel requests all read the same count. A null user or IP
 * skips that cap.
 */
export function buildInsertLimitGuard(args: InsertLimits): RateLimitQuery {
  const since = (args.now ?? Date.now()) - ONE_DAY_SEC * 1000;
  const t = args.table;
  return {
    sql: `(? IS NULL OR (${pendingCountSql(args)}) < ?)
      AND (? IS NULL OR (SELECT COUNT(*) FROM ${t} WHERE user_id = ? AND created_at >= ?) < ?)
      AND (? IS NULL OR (SELECT COUNT(*) FROM ${t} WHERE ip_hash = ? AND created_at >= ?) < ?)`,
    params: [
      args.userId,
      args.userId,
      args.pendingLimit,
      args.userId,
      args.userId,
      since,
      args.userDailyLimit,
      args.ipHash,
      args.ipHash,
      since,
      args.ipDailyLimit,
    ],
  };
}

/** Names the cap a refused insert hit, so the caller can answer with the
 * matching message. Only runs after the guarded insert changed no rows. */
export async function findExceededLimit(
  db: D1Database,
  args: InsertLimits
): Promise<ExceededLimit | null> {
  if (args.userId) {
    const row = await db
      .prepare(pendingCountSql(args))
      .bind(args.userId)
      .first<{ count: number }>();
    if ((row?.count ?? 0) >= args.pendingLimit) return "pending";
    const overDaily = await checkRateLimit(db, {
      table: args.table,
      column: "user_id",
      key: args.userId,
      windowSec: ONE_DAY_SEC,
      limit: args.userDailyLimit,
      now: args.now,
    });
    if (overDaily) return "daily";
  }
  if (args.ipHash) {
    const overIp = await checkRateLimit(db, {
      table: args.table,
      column: "ip_hash",
      key: args.ipHash,
      windowSec: ONE_DAY_SEC,
      limit: args.ipDailyLimit,
      now: args.now,
    });
    if (overIp) return "ip";
  }
  return null;
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
