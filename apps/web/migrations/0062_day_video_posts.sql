-- Where the day's video was posted outside the day page, one row per channel
-- (`telegram-en`, `telegram-vi`). Telegram cannot be read back, so the post
-- path records each post here: publish.mjs after a --prod sendVideo (through
-- PUT /api/admin/day-videos/:date/posts) and the Worker's own card post. The
-- day video watchdog reads it. `date` is the Asia/Ho_Chi_Minh day, the same
-- key as day_videos.date; `ref` is "<chat_id>/<message_id>".
-- Number 0062 assumes 0061 (#683) is applied first: the ledger check rejects
-- an applied order of 0062 before 0061.
CREATE TABLE IF NOT EXISTS day_video_posts (
  date TEXT NOT NULL,
  channel TEXT NOT NULL,
  ref TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (date, channel)
);
