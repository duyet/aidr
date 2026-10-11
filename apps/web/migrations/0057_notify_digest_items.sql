-- The stories a channel's daily digest carried, one row per story.
--
-- A trending post must not repeat a story the same channel's digest already
-- showed. `notifications` holds one `digest:<date>` row per day and no list
-- of stories, and the TL;DR snapshot cannot stand in for it: the snapshot is
-- rewritten on every run, so by the time trending runs it cites the very
-- stories trending is about to post. notify writes these rows at digest send
-- time (worker/notify/posted-events.ts) and reads the last two dates back.
-- `date` is the digest's local calendar date, the same string as
-- `notifications.item_id = 'digest:' || date`. Nothing is seeded here.
CREATE TABLE IF NOT EXISTS notify_digest_items (
  channel TEXT NOT NULL,
  date TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (channel, date, item_id)
);
