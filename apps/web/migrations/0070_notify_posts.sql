-- The caption each story post carried, one row per channel and story.
--
-- `notifications` records that a story went out and its message id, not what
-- it said, so a bad post could not be audited or corrected from D1. notify
-- writes a row here when a story post is `sent` (worker/notify/posted-events.ts),
-- and the admin caption edit reads it back to know how the post was sent and
-- what it said. `kind` is how it was sent: `photo` and `video` carry the
-- caption and the Read button, `album` carries its Read link in the caption,
-- `text` is a `sendMessage`. `caption` is the Telegram HTML as sent and
-- `caption_hash` its SHA-256 hex. Posts sent before this migration have no
-- row; nothing is backfilled.
CREATE TABLE IF NOT EXISTS notify_posts (
  channel TEXT NOT NULL,
  item_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'album', 'text')),
  caption_hash TEXT NOT NULL,
  caption TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (channel, item_id)
);

-- The digest highlight's row is keyed `digest:<date>:top`, which names no
-- story. `story_id` is the story it posted or tried; NULL on every other row,
-- whose `item_id` already is the story.
ALTER TABLE notifications ADD COLUMN story_id TEXT;
