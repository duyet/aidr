-- Rolling weekly digest: the best stories of the 7 audience-zone days
-- `start_date`..`end_date` (inclusive), mailed to weekly subscribers whose
-- chosen weekday (`subscribers.weekly_day`, added at runtime by
-- ensureMailSchema) is the day after `end_date`. One row per end date, built
-- once by the ingest `weekly` step and shared by every subscriber due that
-- day — never per subscriber. A window ending on a Sunday is the ISO-week
-- edition in `weekly_snapshots` and gets no row here.
-- Columns mirror weekly_snapshots (0056); `fallback` = 1 holds title lines
-- after an LLM failure and is retried.
CREATE TABLE IF NOT EXISTS weekly_digests (
  end_date TEXT PRIMARY KEY,
  start_date TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  intro_en TEXT,
  intro_vi TEXT,
  stories_en TEXT NOT NULL DEFAULT '[]',
  stories_vi TEXT NOT NULL DEFAULT '[]',
  fallback INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
