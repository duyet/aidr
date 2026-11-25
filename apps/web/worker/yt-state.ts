/**
 * Small key-value store for the YouTube credential state, on the `yt_state`
 * D1 table (migration 0079). It replaces the Workers KV namespace the keys
 * used to live in; the keys (`youtube-keys.ts`) and their meaning are
 * unchanged. `expires_at` is epoch milliseconds, NULL for no expiry.
 */

/** The value at `key`, or null when it is absent or past its expiry. */
export async function ytGet(
  db: D1Database,
  key: string,
  nowMs: number
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT value FROM yt_state WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)"
    )
    .bind(key, nowMs)
    .first<{ value: string }>();
  return row?.value ?? null;
}

/** Stores `value`, replacing any row, and deletes every expired row. */
export async function ytPut(
  db: D1Database,
  key: string,
  value: string,
  nowMs: number,
  ttlSec?: number
): Promise<void> {
  const expiresAt = ttlSec === undefined ? null : nowMs + ttlSec * 1000;
  await db.batch([
    db.prepare("DELETE FROM yt_state WHERE expires_at <= ?").bind(nowMs),
    db
      .prepare(
        "INSERT INTO yt_state (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at"
      )
      .bind(key, value, expiresAt),
  ]);
}

/** Deletes `key`. True when an unexpired row was there to delete. */
export async function ytDelete(
  db: D1Database,
  key: string,
  nowMs: number
): Promise<boolean> {
  const result = await db
    .prepare(
      "DELETE FROM yt_state WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)"
    )
    .bind(key, nowMs)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
