/** Read-side D1 handle: the raw binding or a `withSession()` handle —
 * both expose prepare/batch. Sessions drop exec/dump, which read paths
 * never use. */
export type DbReader = Pick<D1Database, "prepare" | "batch">;

/** Unconstrained D1 session for read paths: lets D1 answer from the
 * nearest replica when read replication is enabled, and keeps bookmark
 * consistency otherwise. Writes issued on the session still route to the
 * primary, so read paths with a best-effort write (feed TL;DR rebuild,
 * topic-learning schema DDL) keep working. */
export function readSession(db: D1Database): DbReader {
  return typeof db.withSession === "function" ? db.withSession() : db;
}

/** Read freshness from the primary so the footer does not show replica lag. */
export function readPrimarySession(db: D1Database): DbReader {
  return typeof db.withSession === "function"
    ? db.withSession("first-primary")
    : db;
}
