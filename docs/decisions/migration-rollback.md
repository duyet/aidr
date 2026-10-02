# Rollback and recovery notes: all migrations

D1 migrations here only move forward: `pnpm --filter @aidr/web d1:migrate`
applies files in order and records each one in the `d1_migrations` ledger.
There is no down script. This page says how to undo each migration by hand,
and when to restore from Time Travel instead.

Entry convention: every file in `apps/web/migrations/` has one line that
starts with `## ` or `- ` followed by its exact file name (for example
`## 0031_jev_panel_verdicts.sql`). `worker/__tests__/migration-rollback-notes.test.ts`
fails when a migration has no such line, so a new migration cannot land
without a note.

Most migrations are additive and idempotent, so the default answer is: roll
the Worker code back, leave the schema alone. Old code ignores the extra
table, column and rows. Only run the SQL below if the schema itself must go.
Migrations that rewrite or overwrite data say so in their entry.

Run SQL with `pnpm exec wrangler d1 execute aidr --remote --command "..."`.
Take a bookmark first: `pnpm exec wrangler d1 time-travel info aidr`, and note
the timestamp. Test the statement on a local D1 (`--local`) before production.

## 0027_source_registry.sql

- Change: `INSERT OR IGNORE` of the whole source catalog into `sources`. It
  only creates rows that were missing. Five rows are new in this migration:
  `vnexpress-tech`, `techcrunch-ai`, `theverge-ai`, `arstechnica-ai`,
  `wired-ai`. The other rows already existed from earlier migrations.
- Risk: those five sources start fetching on the next hourly run and their
  items enter ranking, email and Telegram.
- Rollback (preferred, keeps history): switch them off. Ingest respects the
  `enabled` flag and the seed never turns it back on.
  `UPDATE sources SET enabled = 0 WHERE id IN ('vnexpress-tech','techcrunch-ai','theverge-ai','arstechnica-ai','wired-ai');`
- Rollback (full): delete the rows only if no item references them.
  `SELECT COUNT(*) FROM items WHERE source_id IN (...);` must be 0,
  otherwise use the disable statement. Then `DELETE FROM sources WHERE id IN (...);`
- Note: the runtime seed (`worker/sources/seed.ts`) upserts from
  `worker/sources/catalog.ts` before migrations apply. Deleting a row that is
  still in the catalog only lasts until the next ingest. Remove it from the
  catalog in the same change.
- Bad items already published: set `items.status` back to a non-published
  value for rows with the affected `source_id`; do not delete them, ranking history and
  `tldr_snapshots` point at them.

## 0028_ga4_insights.sql

- Change: new table `ga4_insights` (one row, id `current`) and one index.
  Written by the GA4 sync (once per 24h, plus `POST /api/admin/ga4-sync`),
  read by `GET /api/system/audience`.
- Risk: none for the pipeline. The table is a cache of Google's numbers.
- Rollback: `DROP INDEX IF EXISTS idx_ga4_insights_fetched_at; DROP TABLE IF EXISTS ga4_insights;`
  Roll the Worker back first, or the sync will fail every day and the Audience
  tab will show "Unavailable". Data is rebuilt by the next sync, so there is
  nothing to restore.

## 0029_subscriber_mail_format.sql

- Change: `ALTER TABLE subscribers ADD COLUMN mail_format TEXT NOT NULL DEFAULT 'design'`.
  The same ALTER also runs at runtime from `ensureMailSchema`, so the column
  may exist before this migration is recorded as applied.
- Risk: dropping the column loses each subscriber's text-vs-designed choice.
  Any code still selecting `mail_format` errors on a missing column.
- Rollback: not needed for a code rollback; old code never reads the column.
  If it must go: export first
  `SELECT id, mail_format FROM subscribers WHERE mail_format <> 'design';`
  then `ALTER TABLE subscribers DROP COLUMN mail_format;`.
  `ensureMailSchema` adds the column again on the next mail send, so also
  remove or revert that code, or the drop is undone silently.
- Re-applying: if the ledger row is removed and the migration re-runs, it fails
  with "duplicate column name". Treat that as already applied and re-insert the
  ledger row rather than dropping the column.

## 0030_arxiv_source.sql

- Change: upsert of one source row, `arxiv-research`
  (rss.arxiv.org, keyword filter, `maxItems` 6). The conflict clause never
  touches `enabled`.
- Risk: research items enter ranking. The flood gate is the row config
  (`keywordFilter`, `maxItems`); `worker/__tests__/arxiv-flood-gate.test.ts`
  covers it.
- Rollback (preferred): `UPDATE sources SET enabled = 0 WHERE id = 'arxiv-research';`
- Rollback (full): same `items.source_id` check as 0027, then
  `DELETE FROM sources WHERE id = 'arxiv-research';`, and remove `ARXIV_SOURCE`
  from the catalog so the seed does not recreate it.
- To narrow instead of remove: edit `config` (lower `maxItems`) with an
  `UPDATE`; the next seed run rewrites config from the catalog, so change the
  catalog too.

## 0031_jev_panel_verdicts.sql

- Change: new table `jev_panel_verdicts` (audit rows for the JEV panel, one
  per run, subject and idempotency key) and two indexes. Written by
  `worker/jev-panel/audit.ts` only when the panel is enabled; the write is
  best effort and never changes a scoring or review outcome.
- Risk: none for the pipeline. Dropping the table loses the audit trail and
  any operator override (`override_decision`, `override_note`) stored on it.
  The admin verdict list and override endpoint error while the table is gone.
- Rollback: turn the panel off first (`JEV_PANEL_ENABLED` unset or `0`), roll
  the Worker back, then if the table must go, export it
  (`SELECT * FROM jev_panel_verdicts;`) and run
  `DROP INDEX IF EXISTS idx_jev_panel_verdicts_created; DROP INDEX IF EXISTS idx_jev_panel_verdicts_subject; DROP TABLE IF EXISTS jev_panel_verdicts;`
- Re-applying: `CREATE ... IF NOT EXISTS`, safe to run again.

## 0032_community_source_ranges.sql

- Change: upsert of two source rows, `hn` and `lobsters`. On conflict it
  overwrites `name`, `type` and `config` (never `enabled`). `hn` gains
  `popularMinPoints` 40 and a shorter `query`; `lobsters` gains `filteredTags`.
  The rows mirror `REGISTRY_0032` in `worker/sources/catalog.ts`.
- Risk: this is an overwrite, not an addition. The earlier `config` of both
  rows is gone, and more stories can enter ranking from the wider ranges.
- Rollback (preferred): put the old config back with an `UPDATE`. `hn` was the
  long query set by 0017:
  `UPDATE sources SET config = '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek OR Qwen OR Mistral OR Llama OR Grok OR Cursor OR Copilot OR Nvidia OR HuggingFace OR ollama OR vLLM OR MCP OR agentic OR OpenRouter"}' WHERE id = 'hn';`
  `lobsters` was tags only:
  `UPDATE sources SET config = '{"tags":["ai","ml","vibecoding"]}' WHERE id = 'lobsters';`
- Note: the runtime seed rewrites `config` from the catalog on the next
  ingest, so revert `REGISTRY_0032` in `worker/sources/catalog.ts` in the same
  change, or the new values come back.
- To stop the sources instead: `UPDATE sources SET enabled = 0 WHERE id IN ('hn','lobsters');`

## 0033_llm_call_route.sql

- Change: adds two nullable columns to `llm_calls`, `route` (JSON array:
  requested id, then the model(s) it resolved to) and `provider`.
- Risk: none for existing rows (they stay NULL). The logger also adds both
  columns at runtime, so a DB without this migration still gets them.
- Rollback: redeploy the previous Worker; it never reads the columns. Only
  drop them if needed:
  `ALTER TABLE llm_calls DROP COLUMN route; ALTER TABLE llm_calls DROP COLUMN provider;`

## 0034_llm_call_id.sql

- Change: adds the nullable `llm_calls.call_id` column, shared by every
  attempt of one LLM invocation (a fallback chain logs one id).
- Risk: none for existing rows (they stay NULL). The logger also adds the
  column at runtime, and falls back to the 0033 insert when it is missing.
- Rollback: redeploy the previous Worker; it never reads the column. Only
  drop it if needed: `ALTER TABLE llm_calls DROP COLUMN call_id;`

## 0035_llm_call_cost_request.sql

- Change: adds two nullable `llm_calls` columns, `cost_usd` (AnyRouter
  `usage.cost`, USD) and `request_id` (AnyRouter `X-Request-ID`).
- Risk: none for existing rows (they stay NULL). The logger also adds both
  columns at runtime, and falls back to the 0034 insert when they are missing.
- Rollback: redeploy the previous Worker; it never reads the columns. Only
  drop them if needed:
  `ALTER TABLE llm_calls DROP COLUMN cost_usd; ALTER TABLE llm_calls DROP COLUMN request_id;`

## 0040_email_contributions.sql

- Change: adds `clerk_users.email_verified` (INTEGER, default 0; written by
  the Clerk webhook and clerk-sync) and creates `contributor_emails` (extra
  sender addresses, pending or confirmed), `contributor_email_sends` (confirmation-mail log for the daily
  cap) and `inbound_emails` (written by the `aidr-email` Worker, consumed by
  the hourly `inbound-email` step), each with its indexes. Nothing existing
  is touched.
- Risk: none for the pipeline. Only the email Worker, the `inbound-email`
  step and the /contribute address list use the new tables. The Clerk
  webhook and clerk-sync upsert now write `email_verified`, so apply this
  migration before deploying that Worker or Clerk upserts fail (Svix retries
  them). Existing rows start unverified: run `POST /api/admin/clerk-sync`
  after applying.
- Rollback: delete the Email Routing rule for `submit@aidr.today` (stops
  intake at once) and redeploy the previous `aidr` Worker. Only drop the
  tables if needed (export first; comments hold user text):
  `DROP TABLE inbound_emails; DROP TABLE contributor_email_sends; DROP TABLE contributor_emails;`
  The column must stay while the new Worker runs; after rolling the Worker
  back it can go: `ALTER TABLE clerk_users DROP COLUMN email_verified;`

## 0041_clerk_verified_emails.sql

- Change: creates `clerk_verified_emails` (user_id, email). Each Clerk
  webhook and clerk-sync upsert deletes that user's rows and inserts the
  addresses Clerk currently marks verified.
- Risk: none for the pipeline. Apply before deploying the Worker that writes
  the table, or those upserts fail and Svix retries them. Run
  `POST /api/admin/clerk-sync` after applying so existing accounts are filled.
- Rollback: redeploy the previous Worker, then
  `DROP TABLE clerk_verified_emails;`

## 0046_day_videos.sql

- Change: creates `day_videos` (date PK, `youtube_id`, `short_id`, title,
  added_by, timestamps) for the optional video on `/date/YYYY-MM-DD`. No rows
  are seeded.
- Risk: none. The day page treats a missing table as "no video".
- Rollback: redeploy the previous Worker, then `DROP TABLE day_videos;`

## 0045_translation_knowledge_seed_terms.sql

- Change: seeds nine active `translation_knowledge` rules (keep-English
  calques and preferred institution names) with `INSERT OR IGNORE`.
- Risk: the rules feed the VI glossary and the draft/review checks, so a bad
  rule triggers repairs; it never blocks a translation.
- Rollback: `DELETE FROM translation_knowledge WHERE id LIKE 'seed-%' AND id != 'seed-agent-keep-english';`
  (or set `status = 'disabled'` on one rule from the admin knowledge view).

## 0044_ai_sources_and_aggregator_caps.sql

Upserts `sources` rows. Roll back by deleting the new ids (`mistral`,
`nvidia-blog`, `nvidia-dev`, `microsoft-research`, `apple-ml`, `together-ai`,
`github-ai`, `latent-space`, `interconnects`, `import-ai`, `bens-bites`,
`ahead-of-ai`) or disabling them, and by restoring the `marketbrief` config to
`{"homepage":"https://marketbrief.now","topics":["ai"]}` and `huggingnews` to
`{}`. Items already fetched stay.

## 0043_hn_model_scope.sql

- Change: widens the Hacker News `sources.config` query so model releases,
  new model kinds, and new AI labs are in the newest-100 search.
- Risk: none for other rows. The next ingest seed writes the same config.
- Rollback: redeploy the previous Worker, then restore the 0032 query:
  `UPDATE sources SET config = '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic OR DeepSeek","popularMinPoints":40}' WHERE id = 'hn';`

## 0042_items_fetched_at_idx.sql

- Change: index `items(fetched_at)` so a run's stored-item list does not scan
  the table.
- Risk: none for existing rows. Apply before relying on that list under load.
- Rollback: `DROP INDEX idx_items_fetched_at;`

## 0039_suggestion_applied_changes.sql

- Change: adds the nullable `translation_suggestions.applied_changes`
  column (JSON list of per-field edits). New code also writes
  `field = 'auto'` for free-form suggestions.
- Risk: none for existing rows (they stay NULL). Apply before deploying the
  Worker that writes it.
- Rollback: the previous Worker reviews `field` as title/summary only, so
  park free-form rows first, or they are reviewed as summary edits:
  `UPDATE translation_suggestions SET status = 'needs_review' WHERE field = 'auto' AND status IN ('pending', 'reviewing');`
  Then redeploy the previous Worker. Only drop the column if needed:
  `ALTER TABLE translation_suggestions DROP COLUMN applied_changes;`

## 0038_translation_knowledge.sql

- Change: creates `translation_knowledge` (reusable EN→VI terminology rules
  learned from accepted suggestions) with a unique `(kind, source_term)`
  index and a status index, and seeds one active rule,
  `seed-agent-keep-english` ("agent" stays English; "đại lý" / "đặc vụ"
  fail QA).
- Risk: active rules add a glossary to VI translate, TL;DR and repair
  prompts and fail translation QA on a forbidden phrase, which sends the
  translation to repair. A bad rule can cause extra repairs.
- Rollback: disable rules first, which stops both effects without a deploy:
  `UPDATE translation_knowledge SET status = 'disabled';`. The previous
  Worker never reads the table. Only drop it if needed (export it first; it
  holds learned rules):
  `DROP TABLE translation_knowledge;`

## 0037_suggestion_instant_review.sql

- Change: adds four nullable `translation_suggestions` columns
  (`applied_text`, `reviewed_at`, `review_started_at`, `review_run_id`) and
  two `(user_id, created_at)` indexes, one on `translation_suggestions` and
  one on `submissions`. New code also writes two new status values,
  `reviewing` (claimed by a reviewer) and `needs_review` (waiting for an
  admin).
- Risk: none for existing rows (they stay NULL). The new Worker's reviewer
  writes these columns, so apply the migration before deploying it.
- Rollback: redeploy the previous Worker. It only reads `pending` rows, so
  move the new statuses back first or they stay invisible to it:
  `UPDATE translation_suggestions SET status = 'pending' WHERE status IN ('reviewing', 'needs_review');`
  Only drop the schema if needed:
  `DROP INDEX idx_suggestions_user_created; DROP INDEX idx_submissions_user_created;`
  then `ALTER TABLE translation_suggestions DROP COLUMN applied_text;` and the
  same for `reviewed_at`, `review_started_at`, `review_run_id`.

## 0036_cloudflare_blog_source.sql

- Change: upserts one `sources` row, `cloudflare-blog` (rss, AI keyword
  filter, maxItems 5). Never touches `enabled`.
- Risk: up to 5 more items per run reach scoring; the score budget test
  keeps the worst case inside the 4-minute step.
- Rollback (preferred): `UPDATE sources SET enabled = 0 WHERE id = 'cloudflare-blog';`
  Deleting the row is also safe once its items are not needed:
  `DELETE FROM sources WHERE id = 'cloudflare-blog';` (revert
  `CLOUDFLARE_BLOG_SOURCE` in `worker/sources/catalog.ts` in the same change,
  or the runtime seed re-creates it).

## 0001 to 0026

Read from the SQL files. Most only create tables, indexes and columns, or
insert missing rows. For those, rollback is redeploying the previous Worker:
old code ignores the extras, and the columns and tables stay in place. Do not
drop them to roll back. Exceptions are listed at the end of this section.

### Additive: redeploy the previous Worker

- 0001_init.sql: base tables (`sources`, `items`, `translations`, `tldr_snapshots`, `workflow_runs`), indexes and two seed source rows (`INSERT OR IGNORE`). This is the base schema; nothing older exists to roll back to.
- 0002_item_sources.sql: table `item_sources`.
- 0003_llm_tokens.sql: column `items.llm_tokens`.
- 0004_subscribers.sql: table `subscribers` and column `tldr_snapshots.sent_at`. Dropping `subscribers` loses every subscriber; restore from Time Travel instead.
- 0005_duplicate_of.sql: column `items.duplicate_of`. It holds merge results; do not clear it.
- 0006_item_content.sql: column `items.image_url`.
- 0007_translation_suggestions.sql: table `translation_suggestions` and three indexes. Holds reader input.
- 0008_submissions.sql: table `submissions`, three indexes and the `user` source row (`INSERT OR IGNORE`). Holds reader input. Stop the source with `UPDATE sources SET enabled = 0 WHERE id = 'user';` rather than deleting it.
- 0009_subscriber_timezone.sql: columns `subscribers.timezone` and `subscribers.last_sent_date`. Removing `last_sent_date` can make a digest send twice.
- 0010_topics.sql: table `topics` and one index.
- 0011_translation_qa.sql: columns `translations.qa_rating` and `translations.qa_at`.
- 0012_workflow_run_stats.sql: column `workflow_runs.stats`.
- 0013_llm_calls.sql: table `llm_calls` and one index.
- 0014_notifications.sql: table `notifications`. It is the guard against posting a story twice; never drop or clear it while Telegram or email is on.
- 0015_admin_audit.sql: table `admin_audit` and one index.
- 0015_mail.sql: tables `email_templates`, `email_campaigns`, `email_sends`, `subscriber_sources`, `subscribe_attempts` and one index. Dropping them loses campaign history and subscriber attribution.
- 0016_llm_calls_usage.sql: columns `llm_calls.prompt_tokens`, `completion_tokens`, `cached_tokens`.
- 0024_item_media_manifest.sql: column `items.media_manifest`, default `'[]'`. Old code ignores it and keeps using `image_url`.
- 0025_llm_call_run_identity.sql: columns `llm_calls.run_id`, `error_code`, `error_status` and one index.
- 0026_clerk_users.sql: table `clerk_users` and two indexes. It only holds a local copy of Clerk user rows.

### Source rows: additive, disable to stop

These only `INSERT OR IGNORE` source rows, like 0027. To stop a source, run
`UPDATE sources SET enabled = 0 WHERE id IN (...)`. Delete a row only if no
item references it, and remove it from `worker/sources/catalog.ts` too.

- 0018_vendor_blogs.sql: `openai`, `anthropic`, `google-ai`, `hf-blog`.
- 0020_marketbrief.sql: `marketbrief`.
- 0021_xai_deepmind_aws.sql: `xai`, `deepmind`, `aws-ml`, `google-dev`.
- 0022_editorial_rss.sql: `mit-tr-ai`, `marktechpost`, `google-research`, `simonwillison`, `the-decoder`, `mit-news-ai`, `lastweekin-ai`.

### No-op

- 0019_subscriber_prefs.sql: `SELECT 1;` only. The `digest_size` column is added at runtime by `ensureMailSchema` (`worker/mail/schema.ts`), so there is nothing here to roll back. To remove the column, revert that code too.

### Rewrites data: specific recovery

- 0017_topic_learning.sql: adds tables `topic_daily` and `learned_keywords` with indexes and inserts the `lobsters` source, but it also runs `UPDATE sources SET config = ... WHERE id = 'hn'`, which replaces the HN query from 0001 with a longer one. The old value: `UPDATE sources SET config = '{"query":"AI OR LLM OR GPT OR Claude OR Gemini OR OpenAI OR Anthropic"}' WHERE id = 'hn';`. Migration 0032 has since replaced this config again, and the runtime seed rewrites `config` from the catalog, so change `worker/sources/catalog.ts` as well. The two new tables hold learned data; export `learned_keywords` before dropping it.
- 0023_translation_reviews.sql: adds columns to `items` and `translations` (`source_lang`, `source_revision`, `target_lang`, `qa_*`), the tables `translation_reviews`, `translation_review_attempts`, `translation_review_state` and `translation_review_resolutions` with indexes, and triggers. Three things need care:
  - Backfill: an `UPDATE translations` sets `source_lang` and `target_lang` for `en` and `vi` rows. Those columns were new, so the values replaced were only the defaults (`en`, `vi`); no earlier data is lost and nothing needs undoing.
  - Immutable history: `translation_reviews`, `translation_review_attempts` and `translation_review_resolutions` have triggers that abort every `UPDATE` and `DELETE`. To clear or drop one, run `DROP TRIGGER` on its two `trg_..._immutable_*` triggers first, and export the rows before, because they are the audit trail.
  - Live triggers: `trg_items_source_revision`, `trg_translations_candidate_invalidation` and `trg_translations_marker_invalidation` keep firing on item and translation edits even after a Worker rollback. They bump `items.source_revision`, clear the `qa_*` markers and reset `translation_review_state` to `pending`. Old code tolerates that. Do not drop the columns they touch without dropping the triggers first, or every item edit errors.
  - Retry caps live in `translation_review_state.attempt_count`; do not reset it (see `translation-qa.integration.test.ts`).

## When to restore instead

Use D1 Time Travel only if data, not schema, is damaged (for example a bad
manual `DELETE` or `UPDATE`):

1. `pnpm exec wrangler d1 time-travel info aidr` to see the retention window.
2. Restore to a timestamp before the change:
   `pnpm exec wrangler d1 time-travel restore aidr --timestamp=<RFC3339>`.
   The restore rewinds the whole database, including subscribers and
   notification rows written since. Check `notifications` afterwards so a
   digest or trending post is not sent twice.
3. Run `pnpm --filter @aidr/web check:migrations` and `GET /api/health`.
4. If the restore went past a migration, the ledger rewinds with it. Deploy
   applies the missing migrations again. This is safe for the additive ones
   (`IF NOT EXISTS`, `INSERT OR IGNORE`). Bare `ALTER TABLE ... ADD COLUMN`
   files (0003, 0004, 0005, 0006, 0009, 0011, 0012, 0016, 0023, 0024, 0025)
   fail with "duplicate column name" if the column survived; treat that as
   already applied and re-insert the ledger row. 0017 and 0032 overwrite
   source config again, so check `sources.config` afterwards.

## Human steps

These notes are untested against production. Confirming a Time Travel
timestamp and running any destructive statement needs an operator with D1
access; nothing here runs from CI.
