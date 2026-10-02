-- Translation knowledge: reusable rules learned from accepted reader
-- suggestions (worker/translation-knowledge.ts). Active rules feed a compact
-- glossary into the VI translate / TL;DR / repair prompts and a
-- deterministic translation-QA check.
-- kind: keep_english | preferred_term | avoid
-- bad_vi / example: JSON. status: active | pending | disabled.
-- hits: how often translation QA caught a violation of this rule.
CREATE TABLE IF NOT EXISTS translation_knowledge (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source_term TEXT NOT NULL,
  vi_term TEXT,
  bad_vi TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  example TEXT,
  from_suggestion_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  hits INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_translation_knowledge_term
  ON translation_knowledge (kind, source_term);
CREATE INDEX IF NOT EXISTS idx_translation_knowledge_status
  ON translation_knowledge (status);

-- Seed: VI_STYLE already says to keep "agent" in English, and models still
-- wrote "đại lý" (sales agent) and "đặc vụ" (secret agent). "tác nhân" is a
-- legitimate AI term, so it is not flagged.
INSERT OR IGNORE INTO translation_knowledge
  (id, kind, source_term, vi_term, bad_vi, note, example, status, created_at)
VALUES (
  'seed-agent-keep-english',
  'keep_english',
  'agent',
  NULL,
  '["đại lý","đặc vụ"]',
  'AI agent stays "agent"/"agents" in English; "đại lý" means sales agent and "đặc vụ" secret agent.',
  '{"source":"OpenAI Agents Took Data From 55 Sites Including CDC and SEC, FT Reports","bad":"Các \"đại lý\" của OpenAI lấy dữ liệu từ 55 trang web","good":"Agents của OpenAI lấy dữ liệu từ 55 trang web"}',
  'active',
  1790812800000
);
