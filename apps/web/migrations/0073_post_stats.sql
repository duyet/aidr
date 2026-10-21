-- Reach and clicks each Page post got, one row per channel, post and UTC day.
--
-- `ref` is the platform's post id, the same text as `notifications.message_id`
-- (Facebook `<page>_<post>`). Values are lifetime totals read on `day`, so a
-- post's growth is the difference between two days. A NULL column means the
-- platform did not report that metric, not zero. Telegram views cannot be
-- read with the Bot API and YouTube has no Worker credential, so only
-- `facebook-en` is filled (worker/notify/facebook-insights.ts).
CREATE TABLE IF NOT EXISTS post_stats (
  channel TEXT NOT NULL,
  ref TEXT NOT NULL,
  day TEXT NOT NULL,
  impressions INTEGER,
  clicks INTEGER,
  PRIMARY KEY (channel, ref, day)
);
