-- Email contributions (docs/decisions/email-contributions.md).
--
-- contributor_emails: extra addresses a signed-in user may send from to
--   submit@aidr.today. Only `confirmed` rows are accepted by the email
--   Worker. token_hash is the SHA-256 of the single-use confirmation token
--   (the raw token only exists in the confirmation mail). One owner per
--   address.
-- contributor_email_sends: one row per confirmation mail sent, kept when the
--   address is removed, so add/remove cycles cannot mail a victim address
--   past the daily cap.
-- inbound_emails: written by the `aidr-email` Worker (apps/email), consumed
--   by the hourly `inbound-email` step. `pending` rows come from a validated
--   sender and carry parsed fields only (never the raw MIME). `ignored` rows
--   carry no content and no address: a sender hash and the reason. The step
--   sets `processed` with the outcome and clears sender_email and, unless the
--   message became a comment, own_text.
-- clerk_users.email_verified: Clerk's verification status for the stored
--   email (webhook / clerk-sync). Only verified account emails may send.
--   Existing rows start at 0; run POST /api/admin/clerk-sync after applying.
ALTER TABLE clerk_users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS contributor_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  token_hash TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  confirmed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_contributor_emails_user
  ON contributor_emails (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contributor_emails_token
  ON contributor_emails (token_hash);

CREATE TABLE IF NOT EXISTS contributor_email_sends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contributor_email_sends_user
  ON contributor_email_sends (user_id, created_at);

CREATE TABLE IF NOT EXISTS inbound_emails (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  sender_hash TEXT NOT NULL,
  user_id TEXT,
  sender_email TEXT,
  message_id TEXT,
  message_id_hash TEXT UNIQUE,
  subject TEXT,
  own_text TEXT,
  links TEXT,
  forwarded_links TEXT,
  is_forward INTEGER NOT NULL DEFAULT 0,
  is_reply INTEGER NOT NULL DEFAULT 0,
  story_ref TEXT,
  story_lang TEXT,
  outcome_kind TEXT,
  outcome_id TEXT,
  item_id TEXT,
  processed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_status_received
  ON inbound_emails (status, received_at);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_user_received
  ON inbound_emails (user_id, received_at);
