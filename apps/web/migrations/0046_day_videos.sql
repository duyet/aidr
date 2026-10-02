-- Optional YouTube media per day archive page (/date/YYYY-MM-DD): a regular
-- 16:9 video (shown on desktop) and/or a 9:16 Short (shown on mobile).
-- `date` is the Asia/Ho_Chi_Minh day, the same key as tldr_snapshots.date.
-- Set by operators/agents through PUT /api/admin/day-videos/:date or the
-- `set_day_video` admin MCP tool; never seeded here.
CREATE TABLE IF NOT EXISTS day_videos (
  date TEXT PRIMARY KEY,
  youtube_id TEXT,
  short_id TEXT,
  title TEXT,
  added_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (youtube_id IS NOT NULL OR short_id IS NOT NULL)
);
