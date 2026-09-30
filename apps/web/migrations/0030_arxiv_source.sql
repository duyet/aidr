-- arXiv cs.AI / cs.LG / cs.CL (#230). Added after 0027 was applied, so it is
-- its own migration; the row mirrors ARXIV_SOURCE in
-- apps/web/worker/sources/catalog.ts (a test asserts they agree).
--
-- rss.arxiv.org has no robots.txt; the sortable API host is Disallow-all and
-- is not used. Flood-gated by keywordFilter + maxItems in the row config.
--
-- Upsert on name/type/config, never enabled: an operator who switched the
-- source off keeps it off.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('arxiv-research', 'arXiv cs.AI / cs.LG / cs.CL', 'rss', '{"feed":"https://rss.arxiv.org/rss/cs.AI+cs.LG+cs.CL","homepage":"https://arxiv.org/list/cs.AI/recent","keywordFilter":"ai","maxItems":6}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
