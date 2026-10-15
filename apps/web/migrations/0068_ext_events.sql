-- Aggregate Chrome extension event counts. One row per UTC day, event and
-- key. No installation id, IP, user agent or cookie is stored; the row is the
-- only record. `event` is an EXTENSION_EVENTS name. `key` is the channel for
-- channel_click, the language for lang_change, and '' for every other event;
-- the Worker only writes allowlisted values (worker/ext-events.ts).
CREATE TABLE IF NOT EXISTS ext_events (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, key)
);
