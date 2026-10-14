-- `tldr_snapshots.fallback`: 1 when ensureDailyTldr stored the headline-only
-- digest (item titles) because the model chain failed or wrote too few
-- bullets, 0 when it stored a model-written digest. Rows written before this
-- column, and rows the homepage rebuilds from titles (src/lib/feed-queries.ts),
-- stay NULL and count as replaceable. A refresh that degrades to headlines
-- never replaces a row marked 0.
ALTER TABLE tldr_snapshots ADD COLUMN fallback INTEGER;
