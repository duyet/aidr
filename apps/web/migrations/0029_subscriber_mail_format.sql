-- Text vs designed digest. Applied at runtime by ensureMailSchema when this
-- file has not been migrated yet; the ALTER is idempotent there.
ALTER TABLE subscribers ADD COLUMN mail_format TEXT NOT NULL DEFAULT 'design';
