-- `tldr_snapshots.fallback`: 1 = headline-only digest, 0 = model digest,
-- NULL = written before this column.
ALTER TABLE tldr_snapshots ADD COLUMN fallback INTEGER;
