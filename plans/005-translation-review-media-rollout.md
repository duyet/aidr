# 005 — Translation review + migration rollout

Status: **IN PROGRESS** for #158/#143. #160 and #161 remain separate drafts.

## Dependency and conflict plan

1. `0023_translation_reviews.sql` is the complete translation-QA migration. It
   contains the current-candidate markers, explicit source/target language
   metadata, source revision/CAS state, append-only attempts, and human
   resolution tables. All review uniqueness keys include `source_revision`, and
   the current state points at the final re-review attempt after a successful
   repair. The migration's reconciliation and table/trigger creation are
   forward-safe; D1's migration ledger/transaction prevents a second partial
   application from re-running the additive column statements. Do not recreate
   the old competing 0025 translation migration.
2. #160 owns `0024_item_media_manifest.sql`. When that migration is integrated,
   apply it after 0023. Preserve the centralized translation upsert/invalidation
   helpers in `worker/d1-bind.ts`; do not copy its direct translation upsert
   over the QA implementation.
3. #161 owns `0025_llm_call_run_identity.sql`. It must remain after 0024 when
   the media migration is present. The translation gate is compatible with
   either standalone #158 or the ordered 0023 → 0024 → 0025 integration and
   fails if a migration filename is out of order.
4. Keep the item bind order explicit: the QA branch appends `source_lang` at
   index 20 after `image_url`; the combined 0023 → 0024 tree must append
   `media_manifest` at index 21 and raise `ITEM_BIND_ARITY` to 22. Update the
   builder, item INSERT column list, and tests together rather than changing
   call-site arity ad hoc. A merge that drops `source_lang` or substitutes
   `media_manifest` into its slot is invalid.
5. Legacy `translations.lang` is reconciled as a target-language key:
   `lang='vi'` becomes `source_lang='en', target_lang='vi'`, and `lang='en'`
   becomes `source_lang='vi', target_lang='en'`. Valid explicit pairs are
   preserved on a later application. Operators must still set item-level
   `source_lang='vi'` explicitly for Vietnamese-source items; the runtime never
   infers direction from diacritics.

## Read-only migration gate

`pnpm run check:migrations` checks filename order locally. The deploy gate
`pnpm run verify:translation-schema` also checks Wrangler's unapplied-migration
list and probes the remote (or `--local`) schema. It never applies a migration.
`pnpm run deploy` runs the order check and this gate before the build and before
`wrangler deploy`; a failed gate blocks both operations.

The supported production sequence is:

```sh
cd apps/web
pnpm run verify:translation-schema
pnpm exec wrangler d1 migrations apply aidr --config wrangler.toml --remote
pnpm run verify:translation-schema
```

Apply `0023` first. If #160 is integrated, apply `0024` next; if #161 is also
integrated, apply its `0025` after `0024`. Do not apply or deploy remotely from
this QA worker. Retain the verifier output in the release checklist.

To inspect the ledger without changing it:

```sh
pnpm exec wrangler d1 migrations list aidr --config wrangler.toml --remote
pnpm exec wrangler d1 execute aidr --config wrangler.toml --remote \
  --command "SELECT name FROM d1_migrations ORDER BY id"
```

## Recovery

- If the gate fails, do not deploy and do not report an empty QA queue. Inspect
  the migration ledger and apply the missing migration with the normal D1
  command in numeric order.
- If a migration was partially applied, stop and inspect `d1_migrations` and
  the relevant schema. Do not delete audit rows or reset review state to make a
  gate pass.
- For a runtime rollback, deploy the prior Worker only after disabling the
  reviewer configuration. Retain additive tables and audit rows for forward
  recovery; do not drop 0023 columns during an incident.
- A stale review is safe to retry only after its source revision/content hash
  changes or an authenticated operator resolves the queue item. Automatic
  cross-run retries are capped at three; an explicit human retry has one
  bounded additional allowance and is recorded in the append-only resolution
  audit.

No remote migration is applied by this plan or by the QA worker.
