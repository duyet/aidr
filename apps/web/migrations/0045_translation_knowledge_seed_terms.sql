-- Seed translation_knowledge (0038) with calques and mistranslated
-- institutions found in a 2026-10-02 review of 170 prod EN→VI pairs. Each
-- bad_vi is a real rendering from that review. Rules feed the VI glossary
-- and both deterministic checks (translation-draft-check.ts after
-- generation, translation-qa.ts at review); bad phrases count per
-- occurrence.
INSERT OR IGNORE INTO translation_knowledge
  (id, kind, source_term, vi_term, bad_vi, note, example, status, created_at)
VALUES
  ('seed-open-weight-keep-english', 'keep_english', 'open-weight', NULL,
   '["mở trọng lượng","trọng lượng mở"]',
   '"Open-weight" stays in English; "trọng lượng" is physical weight, not model weights.',
   '{"source":"Clef: Open-weight decision models, and new RL fine-tuning platform","bad":"Clef: Mô hình quyết định mở trọng lượng","good":"Clef: decision model open-weight"}',
   'active', 1790899200000),
  ('seed-open-weight-spaced-keep-english', 'keep_english', 'open weight', NULL,
   '["mở trọng lượng","trọng lượng mở"]',
   '"Open weight" stays in English; "trọng lượng" is physical weight, not model weights.',
   '{"source":"Xiaomi MiMo-V2.6''s Flash Leads Open Weight Models on Vals Index","bad":"các mô hình mở trọng lượng","good":"các mô hình open-weight"}',
   'active', 1790899200000),
  ('seed-decision-model-keep-english', 'keep_english', 'decision model', NULL,
   '["mô hình quyết định"]',
   '"Decision model" is a product category; keep it in English.',
   NULL, 'active', 1790899200000),
  ('seed-harness-keep-english', 'keep_english', 'harness', NULL,
   '["dây chuyền"]',
   'An evaluation/agent harness stays "harness"; "dây chuyền" is an assembly line.',
   '{"source":"Praxa, an Evidence-Bound Harness","bad":"Praxa - Dây chuyền Thực thi","good":"Praxa, harness thực thi"}',
   'active', 1790899200000),
  ('seed-hyperscaler-keep-english', 'keep_english', 'hyperscaler', NULL,
   '["cường thị trường"]',
   '"Hyperscaler" stays in English.',
   NULL, 'active', 1790899200000),
  ('seed-senate-preferred', 'preferred_term', 'senate', 'Thượng viện',
   '["viện tham nghị"]',
   'Senate is "Thượng viện".',
   NULL, 'active', 1790899200000),
  ('seed-attorney-general-preferred', 'preferred_term', 'attorney general',
   'Tổng chưởng lý', '["trưởng kiểm sát"]',
   'Attorney General is "Tổng chưởng lý".',
   NULL, 'active', 1790899200000),
  ('seed-governor-preferred', 'preferred_term', 'governor', 'Thống đốc',
   '["thống dịch"]',
   'Governor (state or central bank) is "Thống đốc".',
   NULL, 'active', 1790899200000),
  ('seed-white-house-preferred', 'preferred_term', 'white house', 'Nhà Trắng',
   '["thế giới trắng"]',
   'White House is "Nhà Trắng".',
   '{"source":"Trump Hosts Anthropic CEO for First One on One White House Dinner","bad":"Bữa Tối Thế Giới Trắng","good":"bữa tối riêng đầu tiên tại Nhà Trắng"}',
   'active', 1790899200000);
