-- Short Telegram caption summaries, one per story and language.
--
-- A trending post's caption has room for only part of a long source summary.
-- Instead of cutting it, notify asks the LLM once for a version that fits the
-- caption budget and keeps it here, so a retry or the second channel does not
-- generate it again. `source_hash` ties the row to the summary it was written
-- from; a changed summary is regenerated. English and Vietnamese rows are
-- independent (no cross-language fallback). Nothing is seeded here.
CREATE TABLE IF NOT EXISTS notify_summaries (
  item_id TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'vi')),
  source_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, lang)
);
