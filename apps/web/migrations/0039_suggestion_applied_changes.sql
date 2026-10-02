-- Unified suggestions: a reader writes one free-form suggestion and the
-- reviewer decides which fields and languages it changes (field = 'auto').
-- applied_changes: JSON array of {lang, field, before, after}, one entry per
-- field the reviewer actually wrote. applied_text keeps the first entry's
-- text for older readers of the row.
ALTER TABLE translation_suggestions ADD COLUMN applied_changes TEXT;
