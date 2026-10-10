-- LLM-written English summary for English-source stories.
--
-- `items.summary` stays the raw upstream text (RSS teaser, og:description):
-- dedupe, scoring, translation and QA read it as-is. Readers see
-- `summary_en` when `summary_en_revision` equals the row's current
-- `source_revision` (bumped by trg_items_source_revision on any title/summary
-- change, migration 0023); otherwise the raw summary is shown and the
-- backfill-en-summary step regenerates it. Nothing is seeded here.
ALTER TABLE items ADD COLUMN summary_en TEXT;
ALTER TABLE items ADD COLUMN summary_en_revision INTEGER;
