-- Vietnamese day video: the daily news video is produced per language, so
-- /date/YYYY-MM-DD?lang=vi shows its own video/Short and never borrows the
-- English one (and vice versa). `youtube_id` / `short_id` / `title` stay the
-- English columns; the `_vi` columns are the Vietnamese counterparts.
-- Set through PUT /api/admin/day-videos/:date with `lang: "vi"`.
--
-- The old CHECK (youtube_id OR short_id) would reject a Vietnamese-only row,
-- and SQLite cannot alter a CHECK, so the table is rebuilt.
CREATE TABLE day_videos_new (
  date TEXT PRIMARY KEY,
  youtube_id TEXT,
  short_id TEXT,
  title TEXT,
  youtube_id_vi TEXT,
  short_id_vi TEXT,
  title_vi TEXT,
  added_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    youtube_id IS NOT NULL OR short_id IS NOT NULL
    OR youtube_id_vi IS NOT NULL OR short_id_vi IS NOT NULL
  )
);

INSERT INTO day_videos_new
  (date, youtube_id, short_id, title, added_by, created_at, updated_at)
SELECT date, youtube_id, short_id, title, added_by, created_at, updated_at
FROM day_videos;

DROP TABLE day_videos;
ALTER TABLE day_videos_new RENAME TO day_videos;
