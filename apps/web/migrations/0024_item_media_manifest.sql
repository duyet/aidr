-- Bounded, ordered media candidates for each story.
-- image_url remains the legacy single-image compatibility field.
ALTER TABLE items ADD COLUMN media_manifest TEXT NOT NULL DEFAULT '[]';
