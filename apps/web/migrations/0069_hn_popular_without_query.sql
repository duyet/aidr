-- HN without an Algolia query (#873). HN Algolia requires every query word,
-- so the 0043 query required the word OR and matched nothing. Mirrors
-- HN_POPULAR_SOURCE in apps/web/worker/sources/catalog.ts (a test asserts
-- they agree); the reason for the row is written there.
--
-- Migrate D1 applies this on merge, about a minute before the new Worker
-- uploads, so the Worker live in that minute reads it. That Worker must
-- already ignore `query` and run no newest-first search (#874): an older
-- adapter fetches the newest 100 stories unqueried with this config.
-- Upsert on name/type/config, never enabled: an operator who switched HN
-- off keeps it off.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('hn', 'Hacker News', 'hn', '{"popularMinPoints":20}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
