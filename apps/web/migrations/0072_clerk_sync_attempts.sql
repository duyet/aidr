-- Per-user throttle for the on-demand Clerk re-read (syncClerkUserById).
-- One row per user; last_at is epoch seconds of the last claimed sync.
CREATE TABLE IF NOT EXISTS clerk_sync_attempts (
  user_id TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL
);
