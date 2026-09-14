-- MarketBrief AI hub (SvelteKit __data.json, same flattening as HuggingNews).
INSERT OR IGNORE INTO sources (id, name, type, config, enabled) VALUES
  ('marketbrief', 'MarketBrief', 'marketbrief', '{"homepage":"https://marketbrief.now","topics":["ai"]}', 1);
