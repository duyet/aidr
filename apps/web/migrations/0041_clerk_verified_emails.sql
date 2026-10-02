-- Every address Clerk marks verified on a live account. The email Worker
-- accepts mail from these addresses (including ones that are not the primary
-- stored on clerk_users). Replaced on each webhook / clerk-sync upsert.
CREATE TABLE IF NOT EXISTS clerk_verified_emails (
  user_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  PRIMARY KEY (user_id, email)
);
