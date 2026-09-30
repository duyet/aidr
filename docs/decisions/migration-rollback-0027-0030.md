# Rollback and recovery notes: migrations 0027 to 0030

D1 migrations here only move forward: `pnpm --filter @aidr/web d1:migrate`
applies files in order and records each one in the `d1_migrations` ledger.
There is no down script. This page says how to undo each of the four latest
migrations by hand, and when to restore from Time Travel instead.

All four are additive and idempotent, so the default answer is: roll the
Worker code back, leave the schema alone. Old code ignores the extra table,
column and rows. Only run the SQL below if the schema itself must go.

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
   applies the missing migrations again, which is safe because all four are
   idempotent or fail closed as described above.

## Human steps

These notes are untested against production. Confirming a Time Travel
timestamp and running any destructive statement needs an operator with D1
access; nothing here runs from CI.
