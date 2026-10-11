-- Source refresh (2026-10-11 audit of /api/system/sources). Mirrors
-- REGISTRY_0058 in apps/web/worker/sources/catalog.ts (a test asserts they
-- agree); the reasons for each decision are written there.
--
-- Disables reddit-ml, reddit-localllama, reddit-singularity, xai (they refuse
-- Workers egress: fetch_failed on every run, 0 items ever) and ahead-of-ai
-- (409 empty runs). Re-points arstechnica-ai at its technology-lab feed with
-- the AI title filter. Adds probation sources: GitHub releases through the
-- API, HF daily papers, OpenRouter new models, five HF organizations, Ai2 and
-- GenK AI.
--
-- Upsert on name/type/config, never enabled: an operator who switched a
-- source off keeps it off, and a new row is inserted enabled by its default.
INSERT INTO sources (id, name, type, config, enabled) VALUES
  ('reddit-ml', 'r/MachineLearning', 'rss', '{"feed":"https://www.reddit.com/r/MachineLearning/hot/.rss","homepage":"https://www.reddit.com/r/MachineLearning/","minRequestIntervalMs":3000,"maxItems":6}', 0),
  ('reddit-localllama', 'r/LocalLLaMA', 'rss', '{"feed":"https://www.reddit.com/r/LocalLLaMA/hot/.rss","homepage":"https://www.reddit.com/r/LocalLLaMA/","minRequestIntervalMs":3000,"maxItems":4}', 0),
  ('reddit-singularity', 'r/singularity', 'rss', '{"feed":"https://www.reddit.com/r/singularity/hot/.rss","homepage":"https://www.reddit.com/r/singularity/","keywordFilter":"ai","minRequestIntervalMs":3000,"maxItems":4}', 0),
  ('xai', 'xAI News', 'xai', '{"homepage":"https://x.ai","sitemap":"https://x.ai/sitemap.xml"}', 0),
  ('ahead-of-ai', 'Ahead of AI', 'rss', '{"feed":"https://magazine.sebastianraschka.com/feed","homepage":"https://magazine.sebastianraschka.com","maxItems":2}', 0),
  ('arstechnica-ai', 'Ars Technica AI', 'rss', '{"feed":"https://feeds.arstechnica.com/arstechnica/technology-lab","homepage":"https://arstechnica.com/ai/","keywordFilter":"ai","maxItems":6}', 1),
  ('release-ollama', 'Ollama releases', 'githubreleases', '{"repo":"ollama/ollama","project":"Ollama","maxItems":1}', 1),
  ('release-vllm', 'vLLM releases', 'githubreleases', '{"repo":"vllm-project/vllm","project":"vLLM","maxItems":1}', 1),
  ('release-transformers', 'Transformers releases', 'githubreleases', '{"repo":"huggingface/transformers","project":"Hugging Face Transformers","maxItems":1}', 1),
  ('release-codex', 'Codex CLI releases', 'githubreleases', '{"repo":"openai/codex","project":"OpenAI Codex CLI","maxItems":1}', 1),
  ('hf-papers', 'Hugging Face Daily Papers', 'hfpapers', '{"maxItems":2}', 1),
  ('openrouter-models', 'OpenRouter new models', 'openrouter', '{"maxItems":2}', 1),
  ('hf-models-qwen', 'Qwen models on Hugging Face', 'hfmodels', '{"author":"Qwen","maxItems":2}', 1),
  ('hf-models-deepseek', 'DeepSeek models on Hugging Face', 'hfmodels', '{"author":"deepseek-ai","maxItems":2}', 1),
  ('hf-models-moonshotai', 'Moonshot AI models on Hugging Face', 'hfmodels', '{"author":"moonshotai","maxItems":2}', 1),
  ('hf-models-zai-org', 'Z.ai models on Hugging Face', 'hfmodels', '{"author":"zai-org","maxItems":2}', 1),
  ('hf-models-mistralai', 'Mistral AI models on Hugging Face', 'hfmodels', '{"author":"mistralai","maxItems":2}', 1),
  ('ai2', 'Ai2 Blog', 'rss', '{"feed":"https://allenai.org/rss.xml","homepage":"https://allenai.org/blog","maxItems":2}', 1),
  ('genk-ai', 'GenK AI', 'rss', '{"feed":"https://genk.vn/rss/ai.rss","homepage":"https://genk.vn/ai.chn","sourceLang":"vi","timezone":"+07:00","maxItems":2}', 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  type = excluded.type,
  config = excluded.config;

-- One statement, not a row upsert, because enabled is operator-owned.
UPDATE sources SET enabled = 0 WHERE id = 'reddit-ml';
UPDATE sources SET enabled = 0 WHERE id = 'reddit-localllama';
UPDATE sources SET enabled = 0 WHERE id = 'reddit-singularity';
UPDATE sources SET enabled = 0 WHERE id = 'xai';
UPDATE sources SET enabled = 0 WHERE id = 'ahead-of-ai';
