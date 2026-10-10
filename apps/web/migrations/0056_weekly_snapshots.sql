-- Weekly edition: the best stories of one ISO week (Monday..Sunday of
-- Asia/Ho_Chi_Minh dates, the same days as tldr_snapshots.date), built once
-- the week has closed by the ingest `weekly` step (worker/weekly.ts).
--
-- `week` is `YYYY-Www`. `issue` counts weeks from WEEKLY_FIRST_WEEK
-- (src/lib/week.ts) so a rebuilt or backfilled week never renumbers others.
-- `item_ids` is the ranked story list (JSON array). `stories_en` /
-- `stories_vi` are JSON arrays of {item_id, text} one-liners, one column per
-- language with no fallback between them: an empty `stories_vi` or a NULL
-- `intro_vi` means Vietnamese is not ready, never "use English".
-- `fallback` = 1 when the LLM failed and the row holds title one-liners; a
-- later run upgrades it. Nothing is seeded here.
CREATE TABLE IF NOT EXISTS weekly_snapshots (
  week TEXT PRIMARY KEY,
  issue INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  intro_en TEXT,
  intro_vi TEXT,
  stories_en TEXT NOT NULL DEFAULT '[]',
  stories_vi TEXT NOT NULL DEFAULT '[]',
  fallback INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
