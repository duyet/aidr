-- `tldr_snapshots.fallback`: 1 when ensureDailyTldr stored the headline-only
-- digest (item titles) because the model chain failed or wrote too few
-- bullets, 0 when it stored a model-written digest. Rows written before this
-- column stay NULL, as does a row the homepage inserts from titles
-- (src/lib/feed-queries.ts); both count as replaceable. A homepage rebuild of
-- an existing row keeps its flag. A refresh that degrades to headlines never
-- replaces a useful row marked 0.
ALTER TABLE tldr_snapshots ADD COLUMN fallback INTEGER;
