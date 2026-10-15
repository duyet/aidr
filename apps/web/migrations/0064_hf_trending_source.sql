-- Hugging Face trending models (2026-10-16). Mirrors REGISTRY_0064 in
-- apps/web/worker/sources/catalog.ts (a test asserts they agree); the reason
-- for the row is written there.
--
-- Upsert on name/type/config, never enabled: an operator who switched the
-- source off keeps it off, and a new row is inserted enabled by its default.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('hf-trending', 'Hugging Face trending models', 'hftrending', '{"maxItems":2}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;
