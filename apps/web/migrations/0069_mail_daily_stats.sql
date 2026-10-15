-- Aggregate digest delivery counts. One row per UTC day and digest language.
-- No address, token or subscriber id is stored, and nothing is tracked in the
-- mail itself. `sent` counts a subscriber once, when their send stamp moves
-- (worker/mail/stats.ts); `failed` counts failed attempts; `unsubscribed`
-- counts removed subscribers.
CREATE TABLE IF NOT EXISTS mail_daily_stats (
  date TEXT NOT NULL,
  lang TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, lang)
);
