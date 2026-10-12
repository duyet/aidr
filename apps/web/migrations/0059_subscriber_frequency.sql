-- Daily vs weekly mail (`frequency`) and the last weekly edition mailed
-- (`last_weekly_sent`, `YYYY-Www`). Both columns are owned at runtime by
-- ensureMailSchema() (worker/mail/schema.ts), like digest_size (0019):
-- replaying the ALTERs here would fail where the worker already added them,
-- so this migration stays a no-op for journal continuity.
SELECT 1;
