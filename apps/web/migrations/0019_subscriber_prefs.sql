-- Digest size + settings live on the same unsubscribe token (no extra secret).
-- digest_size is owned at runtime by ensureMailSchema() (worker/mail/schema.ts);
-- replaying the ALTER here fails where the worker already added it, so this
-- migration stays a no-op for journal continuity. Do not re-add the ALTER.
SELECT 1;
