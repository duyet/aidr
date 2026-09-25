-- Clerk accounts mirrored into D1.
--
-- Rows only ever enter this table from a signature-verified Clerk webhook
-- (POST /api/webhooks/clerk, worker/clerk-webhook.ts) or the admin-gated
-- Clerk Backend API backfill (POST /api/admin/clerk-sync). The AIDR signups
-- metric on /data is a COUNT(*) over these rows — never a live Clerk Admin
-- call on a page load, and never a number inferred from a page of users.
--
-- `id` is the Clerk user id and the primary key, so a redelivered webhook
-- upserts instead of duplicating an account. `deleted_at` is a soft delete:
-- a `user.deleted` event keeps the row for audit but excludes it from the
-- signup total, so the count can only fall when Clerk says a user is gone.
--
-- Nothing here is backfilled by guessing: an empty table is a real `0`
-- (pre-backfill) and the reader reports it honestly instead of inventing a
-- number. `created_at` is Clerk's own account creation time (epoch seconds);
-- `updated_at` is when D1 last saw this account.
CREATE TABLE IF NOT EXISTS clerk_users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_clerk_users_created_at
  ON clerk_users (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clerk_users_email
  ON clerk_users (email);
