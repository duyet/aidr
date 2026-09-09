-- Digest size + settings live on the same unsubscribe token (no extra secret).
ALTER TABLE subscribers ADD COLUMN digest_size INTEGER NOT NULL DEFAULT 5;
