-- `tldr_snapshots.fallback`: 1 = headline-only digest, 0 = model digest,
-- NULL = written before this column or inserted by the homepage.
ALTER TABLE tldr_snapshots ADD COLUMN fallback INTEGER;
