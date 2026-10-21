-- Headline font for the digest email: sans (default) or serif.
-- Also applied at runtime by ensureMailSchema; the ALTER is idempotent there.
ALTER TABLE subscribers ADD COLUMN mail_font TEXT NOT NULL DEFAULT 'sans';
