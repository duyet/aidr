/**
 * Anonymous MCP read rate limit.
 *
 * Making `POST /api/mcp` readable without auth turns it into the site's
 * only unauthenticated write-free endpoint that runs a D1 query with
 * caller-chosen arguments. That is a denial-of-service surface and a
 * Cloudflare billing surface, so this is a hard requirement of #227, not a
 * follow-up.
 *
 * It reuses `worker/rate-limit.ts` — the same `checkRateLimit` +
 * `hashIp` + `subscribe_attempts(ip_hash, created_at)` mechanism the
 * subscribe handler and the admin failed-auth limiter already use. There
 * is deliberately no second limiter: two limiters over one table is one
 * limiter with two numbers, and a second implementation is a second thing
 * to get wrong under load.
 *
 * Key namespace: `mcp-read:` prefixes the hashed IP so these rows can
 * never be confused with the subscribe (`hash(ip)`) or admin-auth-failure
 * (`admin-fail:hash(ip)`) rows that share the table.
 *
 * Fail-closed: if the counter query throws we refuse the read rather than
 * serving it. A limiter that silently fails open is not a limiter, and the
 * admin failed-auth limiter's fail-open posture is a different trade-off —
 * there the fallback is to let a *credentialed* operator through, here it
 * would let anyone through. The table is created by migration 0015 and by
 * `ensureMailSchema`, so it is present in every deployed environment.
 */

import { checkRateLimit, hashIp } from "../rate-limit.js";

/** Anonymous read calls per IP per window. Sized for a real agent
 *  (an `initialize` + `tools/list` + a handful of reads is ~5 calls) with
 *  headroom for a burst, and small enough that one IP cannot drive a
 *  meaningful share of the D1 read budget. */
export const MCP_READ_LIMIT = 60;
export const MCP_READ_WINDOW_SEC = 60;
export const MCP_READ_RETRY_AFTER_SEC = MCP_READ_WINDOW_SEC;

const KEY_PREFIX = "mcp-read:";
const TABLE = "subscribe_attempts";

async function readKey(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return `${KEY_PREFIX}${await hashIp(ip)}`;
}

export type McpReadLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number };

/**
 * Counts this request against the window and reports whether it is
 * allowed. Records exactly one row per served read, mirroring the
 * subscribe handler (check, then insert). Admin-authenticated traffic
 * never reaches here, so the operator path keeps its own unlimited gate.
 */
export async function checkAnonymousMcpReadLimit(
  request: Request,
  db: D1Database,
  now = Date.now()
): Promise<McpReadLimitResult> {
  const key = await readKey(request);
  let blocked: boolean;
  try {
    blocked = await checkRateLimit(db, {
      table: TABLE,
      column: "ip_hash",
      key,
      windowSec: MCP_READ_WINDOW_SEC,
      limit: MCP_READ_LIMIT,
      now,
    });
  } catch {
    // Fail CLOSED. A limiter that silently fails open is not a limiter, and
    // the admin failed-auth limiter's fail-open posture is a different
    // trade-off: its fallback lets a *credentialed* operator through, this
    // one would let anyone through. The table is created by migration 0015
    // and by `ensureMailSchema`, so it exists in every deployed env.
    console.error(
      JSON.stringify({
        event: "mcp.read_limit_unavailable",
        errorType: "D1Error",
      })
    );
    return { ok: false, retryAfterSec: MCP_READ_RETRY_AFTER_SEC };
  }
  if (blocked) {
    return { ok: false, retryAfterSec: MCP_READ_RETRY_AFTER_SEC };
  }
  try {
    await db
      .prepare(`INSERT INTO ${TABLE} (ip_hash, created_at) VALUES (?, ?)`)
      .bind(key, now)
      .run();
  } catch {
    // The counter read above already succeeded, so the table exists; a
    // failed write means we simply under-count this one request rather
    // than failing a legitimate read.
  }
  return { ok: true, remaining: MCP_READ_LIMIT - 1 };
}

/**
 * Header surface so a well-behaved client can back off before it gets a
 * 429 instead of after.
 */
export function mcpReadLimitHeaders(remaining: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(MCP_READ_LIMIT),
    "X-RateLimit-Remaining": String(Math.max(0, remaining)),
    "X-RateLimit-Window-Sec": String(MCP_READ_WINDOW_SEC),
  };
}
