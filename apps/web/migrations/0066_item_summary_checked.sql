-- When backfill-content's summary leg last fetched this row (#811). NULL means
-- never. The leg selects only NULL rows, so a page that refuses the bot
-- (reuters.com 401, ft.com 403) or a teaser the article never improves is
-- fetched once, not on every run while it sits in the newest-15 head.
ALTER TABLE items ADD COLUMN summary_checked_at INTEGER;
