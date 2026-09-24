# 005 — Translation review + media migration rollout

Status: **IN PROGRESS** for #143; #160 remains a separate draft.

## Dependency and conflict plan

1. Keep migration `0023_translation_reviews.sql` owned by #143.
2. Apply #160's `0024_item_media_manifest.sql` after #143's 0023 and before the
   hardening migration. Do not copy or resolve the media migration blindly.
3. Apply `0025_translation_review_hardening.sql` after 0023 and, when the media
   branch is present, after 0024. It adds source/target metadata, revision CAS,
   immutable attempts, leases/state, resolutions, and invalidation triggers.
   Existing rows conservatively backfill to `source_lang='en'`; operators must
   set `source_lang='vi'` explicitly for Vietnamese-source items rather than
   relying on a text/diacritic heuristic.
4. Rebase #160 onto the resulting #143 branch. Preserve the centralized translation upsert/invalidation helpers in `worker/d1-bind.ts`; do not
   reintroduce direct translation upserts in the media diff.
5. Keep the item bind order stable: the QA branch appends `source_lang` after
   `image_url`; the media integration must append `media_manifest` after that
   field. `ITEM_BIND_ARITY` and its tests must be updated together rather than
   changing call-site arity ad hoc.

## Read-only schema gate

`pnpm run verify:translation-schema` runs Wrangler migration-list and schema
queries without applying anything. `pnpm run deploy` runs the gate before build
and deploy. The gate fails closed if 0023/0025 (or 0024 when present in the
combined tree) is pending, or if the remote translation tables/marker columns
are absent.

For production verification, run the following read-only commands and retain
their output in the release checklist:

```sh
cd apps/web
pnpm run verify:translation-schema
pnpm exec wrangler d1 migrations list aidr --config wrangler.toml --remote
pnpm exec wrangler d1 execute aidr --config wrangler.toml --remote \
  --command "SELECT name FROM sqlite_master WHERE name LIKE 'translation_review%';"
```

## Recovery

- If the gate fails, do not deploy or manually mark QA as zero pending.
- Apply the missing migrations in numeric order with the normal D1 migration
  command, then rerun the read-only verifier and the focused tests.
- If a migration was partially applied, stop and inspect the D1 migration
  table/schema; do not delete audit rows or reset `translation_review_state`.
- For a runtime rollback, deploy the prior Worker only after disabling the
  QA/reviewer configuration or feature gate; retain the additive tables and
  audit rows for forward recovery. Do not drop 0023/0025 columns during an
  incident.
- A stale review is safe to retry only after its source revision/content hash
  changes or an authenticated operator resolves the queue item.

No remote migration is applied by this plan or by the QA worker.
