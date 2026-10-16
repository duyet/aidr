# aidr.today — Feed Algorithm

How each `NewsIngestWorkflow` run turns raw sources into the ranked,
bilingual feed.

- [Overview](#overview)
- [Scheduling & coalesce](#scheduling--coalesce)
- [Audience metrics (GA4 snapshot)](#audience-metrics-ga4-snapshot)
- [Ingest HTTP / D1 contract](#ingest-http--d1-contract)
- [Dry runs, reruns and previews (admin / MCP)](#dry-runs-reruns-and-previews-admin--mcp)
- [Agent read surfaces](#agent-read-surfaces)
- [Ops pitfalls](#ops-pitfalls)
- [Pipeline (per ingest run)](#pipeline-per-ingest-run)
  - [1. Fetch](#1-fetch)
  - [1b. Per-source health + staleness](#1b-per-source-health--staleness)
  - [2. Dedupe](#2-dedupe)
  - [3. Enrich](#3-enrich)
  - [4. Score (decision router, then Jev, then LLM)](#4-score-decision-router-then-jev-then-llm)
  - [5. Merge (LLM + title similarity)](#5-merge-llm--title-similarity)
  - [6. Translate (LLM)](#6-translate-llm)
  - [7. Rank (pure code, `worker/ranking.ts`)](#7-rank-pure-code-workerrankingts)
  - [8. Write](#8-write)
  - [9. Backfill](#9-backfill)
  - [10. TL;DR (LLM)](#10-tldr-llm)
  - [10b. Weekly edition (LLM)](#10b-weekly-edition-llm)
  - [11. Email digest](#11-email-digest)
  - [12. Notify (`worker/notify/`)](#12-notify-workernotify)
  - [13. Review gates (LLM, rating ≥ 0.6)](#13-review-gates-llm-rating--06)
- [LLM transport](#llm-transport)
- [Note on "system prompt"](#note-on-system-prompt)

## Overview

One ingest run does three jobs. The scheduler starts one every 30 minutes, with a 25-minute coalesce (`INGEST_MIN_INTERVAL_MS`). Prompts live in `worker/llm.ts`; the steps live in `worker/ingest/` (one module per step), run in order by `worker/workflow.ts`.

| Phase | What it writes | Where |
| --- | --- | --- |
| Consume | Source rows become `items` (fetch, dedupe, enrich) | `worker/sources/`, `worker/dedupe.ts`, `worker/enrich.ts` |
| Rank | Scores, translations, `rank_score`, then today's `tldr_snapshots` row (`bullets_en`, `bullets_vi`) | `worker/llm.ts`, `worker/ranking.ts`, `worker/tldr.ts` |
| Publish | The same edition, per language, with no cross-language fill-in | `worker/digest/edition.ts` |

Publish has two deliveries and they do not share a clock or a table:

- **Email** (`worker/subscribe/send.ts`) — two lanes, English and Vietnamese. From 07:00 in each subscriber's timezone. Size 3/5/10 (default 5) and layout (`no-images`, `design`, `large` or `text`, see `src/lib/mail-format.ts`) come from that subscriber. The subject leads with the top headlines plus "+N more"; the preheader is written, not story text (§11). Idempotency is `subscribers.last_sent_date`. Subscribers with `frequency = weekly` skip these lanes and get the weekly edition on Monday morning instead (§11, idempotency `last_weekly_sent`). A browser preview through the same `renderEditionEmail` is `GET /api/subscribe/preview?lang=&n=&format=`.
- **Telegram** (`worker/notify/`) — VI (`telegram`) and EN (`telegram-en`), from 08:00 `Asia/Ho_Chi_Minh`, one message with the day card's 6 stories, once per channel per local date in `notifications`. Trending stories use the same caps on every notifier.
- **Facebook** (`worker/notify/facebook.ts`) — English Page (`facebook-en`) when `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN` are set. Same digest hour and the same trending bar, cap and gap. One Graph `/{page-id}/feed` link post per send. Facebook scrapes that site for the preview. The Worker uploads no photo or video. Unset Page id and token leave the channel off. A policy or auth error is not retried. `pnpm facebook:mint` writes a new Page token into `.env.local`.

An empty `bullets_vi` or `bullets_en` means that language is not ready. The channel skips and the next run retries. Notifiers strip page chrome and a trailing outlet credit from each bullet (`stripEmbeddedChrome`), drop a bullet that strips to nothing, and only then take the top `DIGEST_MAX_BULLETS`. A snapshot whose every bullet strips to nothing skips as `empty_after_strip`, not `no_snapshot`. Email is not a `Notifier`: a notifier is one target plus a trending post.

## Scheduling & coalesce

Instances are started every 30 minutes by the `NewsIngestScheduler`
Durable Object alarm. That is not a Worker `[triggers]` cron (Free 5-cron
cap) and not Workflow `schedules` (paid-plan).

GitHub Actions (`.github/workflows/ingest.yml`, four independent crons at
:05/:20/:35/:50) POSTs `/api/admin/ingest` as a watchdog because GitHub
routinely delays or skips scheduled workflows.

Both paths coalesce: a new instance is skipped if one started in the last
25 minutes. `POST /api/admin/ingest?force=1` (workflow_dispatch) bypasses
the window.

## Audience metrics (GA4 snapshot)

The `/data` **Audience** tab shows page views, DAU, MAU, where readers come
from, and the subscriber breakdowns. Traffic comes from GA4; subscribers come
from D1. They are never mixed.

- **GA4 is pulled, never read live.** The browser's GA4 events are not
  readable by the Worker, so `worker/ga4/insights.ts` signs a read-only
  service-account assertion and runs six `properties.runReport` calls: a
  90-day `date` series, a dimension-less 28-day totals row, top `pagePath`
  by views, and three 28-day acquisition tables ranked by `sessions` (with
  `activeUsers`): `sessionDefaultChannelGroup` (`channels`),
  `sessionSource` + `sessionMedium` (`sourceMedium`, named `telegram / social`),
  and `landingPage` (`landingPages`). The result is stored as one row in
  `ga4_insights` (migration 0028) and served by `GET /api/system/audience`.
  A page load never calls Google.
- **Landing pages are paths only.** The audience endpoint is public and the
  28-day window can hold hits recorded before URLs were scrubbed, so the sync
  asks for `landingPage` (never `landingPagePlusQueryString`) and both the
  sync and `parseGa4Snapshot` strip any `?query` or `#hash`. A snapshot
  stored before the acquisition tables existed parses with them empty.
- **The sync rides the ingest alarm.** `NewsIngestScheduler.alarm()` calls
  `maybeSyncGa4Insights` behind a 24-hour gate, because the account cannot
  spend Worker cron slots and GA4 does not resolve finer than a day. It is
  best-effort: a failed audience sync never fails the ingest alarm.
  `POST /api/admin/ga4-sync` forces one; on `status: "ok"` it also returns
  `rows` (`daily`, `topPages`, `channels`, `sourceMedium`, `landingPages`
  counts) so an operator can check the snapshot's shape after a deploy.
- **DAU is `activeUsers` on the latest day in the series; MAU is `totalUsers`
  over the trailing 28 days.** MAU is never a sum of daily `activeUsers` —
  a user active on three days is one monthly user, not three.
- **Every failure mode is a status, not a number.** `unconfigured` (no
  migration, no credential, or no sync has ever written a row), `error` (the
  read or the payload failed), and `stale` (snapshot older than 48h, still
  shown but dated). None of them may render as `0` — a confident zero
  audience over an unanswered question is the one number this surface must
  never show. A `runReport` that returns no totals row is an `error`, not a
  zero, and it leaves the previous snapshot untouched.
- Credentials: `GA4_PROPERTY_ID` (public, `[vars]`) and
  `GA4_SERVICE_ACCOUNT_JSON` (secret, Viewer on the property). The token
  endpoint is pinned to `https://oauth2.googleapis.com/token`; the
  `token_uri` inside the key file is ignored.

The Durable Object only gates the 25-minute coalesce and records
last-started.

## Ingest HTTP / D1 contract

HTTP `POST /api/admin/ingest` picks the instance uuid, **upserts
`workflow_runs` with `.run()` / `batch()`** (D1 writes do not populate
`.first()` / `.results`) **then lastRun-verifies** on the Worker D1
binding. The verify session is `first-primary`. The epoch-normalized query
is the same one `/api/system` uses:

```text
ORDER BY CASE WHEN started_at > 1e12 THEN started_at / 1000 ELSE started_at END DESC, id DESC LIMIT 1
```

Invoke `batch()` as a **method** on the binding (`db.batch(stmts)`).
Extracting `db.batch` or `batch.call(db, stmts)` throws `Illegal invocation`
on native Workers D1 (#1415 extract, #1417 `Function.prototype.call`
leftover — live force POST still HTTP 500).

A leftover millisecond `started_at` on `42d830a9-…` must not sort above a
newer seconds persist. A 2xx POST cannot happen unless that SELECT returns
the POST id. Then `NEWS_INGEST.create({ id })` from that isolate.

#1413's INSERT…RETURNING `.first()` 500'd the live force POST. #1411's
WHERE-id SELECT was 2xx for `5419a68e-…` while lastRun stayed
`42d830a9-…`.

## Dry runs, reruns and previews (admin / MCP)

`POST /api/admin/ingest` takes an optional JSON body
`{ force?, dryRun?, steps? }` (`?force=1` still works; no body = normal
run). MCP `trigger_ingest` takes the same arguments. Bad input is a 400:
an unknown step name is rejected at the trigger and dropped (never a crash)
inside the Workflow. The mode travels as `create({ id, params })` and
`worker/ingest/mode.ts` owns the step names:
`fetch, dedupe, score, translate, write, backfill-content,
backfill-translate, backfill-en-summary, backfill-score, qa-translations, inbound-email,
review-suggestions, review-submissions, tldr, weekly, email, notify`. In a dry run
`inbound-email` only classifies the pending batch (no rows written, no
acknowledgements sent).

- **`dryRun: true`** — `sendEmailDigest` and `notifyChannels` return before
  calling `sendDailyTldr` / `dispatchStoryNotifications` and record
  `skipped` / `dry run: no email or telegram`. The TL;DR step runs as
  `tldr-preview`: same items, LLM, fallbacks and keep rule as `ensureDailyTldr`
  (a kept model digest reports `kept`, rated degraded like the live run, and its
  bullets show in the preview, not headlines), no
  `tldr_snapshots` upsert; `stats.tldrPreview` keeps the bullet count and
  the first 3 bullets per language. The weekly step runs as
  `weekly-preview`: it builds last closed week's edition, ignores the gate,
  writes no `weekly_snapshots` row, and keeps a bounded `stats.weeklyPreview`
  (`agent rerun weekly --wait`). `runHealthCheck` returns before any
  Bugsink health alert, owner Telegram DM, GitHub alert issue or daily
  summary. Stats carry `mode: "dry-run"`.
- **`steps: [...]`** — only those steps run; the rest record `skipped` /
  `not selected`. `fetch → dedupe → score → translate → write` is a chain:
  a chain step runs only when every earlier one is selected (otherwise
  `needs …`), so a rerun never writes unscored rows. Stats carry
  `selectedSteps`. `rerun tldr` = `steps: ["tldr"]`.
- **Scheduling** — dry and partial runs go through the 25-minute coalesce
  gate like any trigger (`force` bypasses it) but never call `markStarted`
  and never push the 30-minute alarm back, so they do not delay the next real
  run. A forced dry run can still overlap a real run.
- **History** — health-check history and the source empty-run streak carry
  skip dry-run rows (`NOT_DRY_RUN_SQL`), as do the 24h English-in-Vietnamese
  window and the daily summary (a dry run translates and writes D1, so its
  `stats.viEnglish` and `items_new` would inflate both). `sourceHealth` is only stored when
  the chain reached translate.

What a dry run **still does** (it gates distribution, not D1):

- `write` inserts fetched items and re-ranks today: new items appear on the
  site, API, MCP and feeds at once, and the next real run's notify step can
  post them to Telegram / email (notify reads D1).
- `review-submissions` / `review-suggestions` can approve user input;
  `qa-translations`, backfills, topic learning and vendor-source seeding
  write D1. Pick `steps` to avoid them.
- LLM calls are logged to `llm_calls`; step exceptions still reach Bugsink
  through `safeStep` (real bugs).
- The run row becomes `/api/system` lastRun (the verified create persist
  requires it).

Read-only previews: `GET /api/admin/preview/ranking?limit=N`
(`preview_ranking`: last-24h published items by stored `rank_score`, with
`rankScore` inputs and the score if re-ranked now) and
`POST /api/admin/preview/tldr` (`preview_tldr`: en/vi bullets, LLM calls
under a `tldr-preview-…` operation id, no D1 writes besides `llm_calls`).

Admin regenerate: `POST /api/admin/tldr/regenerate` (today) or
`POST /api/admin/tldr/regenerate/YYYY-MM-DD` (a date up to 14 days back,
not after today ICT; else 400), optional body `{ dryRun? }`
(`regenerateDailyTldr` in `worker/tldr.ts`). It skips the refresh gate and
composes from that date's window: the rolling 24h up to now for today,
capped at the end of the ICT day, and the whole ICT calendar day for a closed
date (the same stories as /date/<d>). It upserts the row
(`fallback = 0`, `sent_at` kept) only for a model digest in both
languages: each column at the useful floor, VI in Vietnamese, no headline
fallback. Anything else leaves the stored row
exactly as it was, whatever it holds, and the response says why
(`written: false`). A dry run returns the bullets and writes nothing. It
never sends: notify and email read only the current local day's row on their
own schedule, and dedupe per channel or subscriber and date.

To inspect the stored row before or after a regenerate, query D1 with
Wrangler (`cf d1 query` currently returns 403), from `apps/web`:
`pnpm exec wrangler d1 execute DB --remote --command "SELECT date, fallback, created_at FROM tldr_snapshots WHERE date = '2026-10-13'"`.

Ranking replay: `pnpm --filter @aidr/web rank-replay [--days 14] [--cache f]
[--formulas current,D+I+B,final]` reads the last 14 days of published items,
merged members, vote nets and TL;DR snapshots from prod D1 (`cf d1 query`,
SELECT only, no writes) and recomputes rank at hourly `now` for each named
formula. It prints TL;DR overlap of the hourly top 8, duplicate-event slots
and age of the top 30, hours-to-top-10 for importance 8+, top-10 overlap with
the old formula, and how far one vote moves an item. Points and votes are
their final values, not their values at each hour, and the TL;DR snapshot was
picked under the formula live then, so treat it as a comparison between
formulas, not a forecast. Run it before changing `worker/ranking.ts`.

Local CLI: `pnpm --filter @aidr/web agent <audit|ranking|tldr-preview|tldr-regenerate|run|rerun|unmerge>`
(`apps/web/scripts/aidr-agent.ts`). `run` / `rerun` are dry unless `--live`.
`tldr-regenerate [--date YYYY-MM-DD] [--dry-run]` always calls the dated
route, which a server without it answers 404.

### Unmerge (admin)

`POST /api/admin/unmerge` with `{ pairs, dryRun? }` reverses wrong cluster
merges (#733); each pair is `{ canonicalId, mergedId, group? }`, and pairs
sharing a `group` under one canonical are one story (aggregator twins). It
is a dry run unless `dryRun: false`. `agent unmerge <pairs.json>` plans
locally from production D1 through `wrangler d1 execute`, SELECT only, and
`--apply` posts to the endpoint. `worker/unmerge/` holds the planner.

- A restored group is replayed through the merge planner and
  `planNewItemWrite` as ingest would have written it without the wrong
  canonical: one lead row, its twins merged into it, its own sources and
  media. Its status follows the relevance bar, so a row under 0.4 comes back
  `rejected`. A VI-source lead gets its native `translations` row; others
  wait for `backfill-translate`. One rule is stricter than ingest: a lead
  with a picture of its own keeps it and takes no twin's picture, so a
  twin's better-tier image (an expiring `pbs.twimg.com/card_img`) never
  replaces the lead's working card.
- A restored story can already be live: the aggregator twin that arrived
  after the wrong merge publishes on its own, since ingest clusters only
  against published rows. Before restoring a group, the plan reads the live
  rows within `TWIN_WINDOW_SEC` (96h) of it (`worker/unmerge/twins.ts`):
  published rows, and rows merged into a published root (their
  `duplicate_of` chain ends at a published row). The rows the request
  itself moves are left out. A row with the same URL, the same
  huggingnews/marketbrief slug hash, the same vnexpress article id, or the
  same normalized title from another source within `MERGE_LOOKBACK_SEC` is
  the same story: the group stays `merged`, re-pointed to the published
  root (`repoint`), which takes the group's sources, topics, reader
  engagement and corroboration as ingest's merge into a published canonical
  would. A live row with a picture of its own keeps it. The URL key ignores
  the scheme, `www.`, the fragment, tracking keys and a trailing slash, and
  keeps the query (HN's `item?id=`); source attribution uses the same key.
- A merged copy unlike its root (no identity and no near-duplicate title
  with it) is likely a wrong merge itself, so identity with it holds the
  group as `needs-decision` instead of re-pointing it under an unrelated
  story.
- A row that is only likely the same event waits as `needs-decision`, and
  its candidates are the published roots, which a `sameAs` can name. Likely
  is the title pass's near-duplicate rule, or four shared evidence words
  (`evidenceTokens`: names, numbers with units, uncommon words), within
  96h, a day past the merge lookback. A Vietnamese row and an English row
  compare in English through the stored `translations` title (lang `en`),
  as the trending guard does (#786); the translation is model output, so
  it never makes identity. The group waits until the pairs file says
  `"sameAs": "<id>"` (re-point to that row) or `"distinctFrom": ["<id>"]`
  (a different story; publish unless another live row matches). A group
  under the relevance bar restores as `rejected` and needs no decision. A
  live twin inside the quiet window, written by another batch of the
  request, or restored by an earlier group of the same request defers the
  group to a rerun.
- Before any group is planned, the groups of the request that are a live
  story's copy (a `sameAs`, or identity with a live row or with another
  such group) join the live rows under the published root they name. A
  near-duplicate of such a group then waits as `needs-decision` with that
  root as its candidate, whichever group is planned first (#798). Its rows
  count even when its own re-point waits for a rerun (`twin-busy`).
- `"distinct": true` says only that the group is not its canonical's story:
  it overrules an identity match with the canonical (`twin-is-canonical`)
  and nothing else. The live-row check above still runs for every group, so
  a `distinct` row that is live as another id re-points or waits, and never
  publishes a second copy. An identity match with a live row other than the
  canonical is never overruled, not even by `distinctFrom`. Until #790 the
  plan skipped the live-row check for a `distinct` pair, and the #749
  fixture, all `distinct`, was applied that way.
- The canonical loses the sources, assets, tags and points attributable to
  the removed items. Source rows are attributed by URL, by an HN/Lobsters
  discussion's `posted_at`, and by position (a tweet run belongs to the
  member whose appended URL row ends it). Rows it cannot attribute stay on
  the canonical and are reported as ambiguous. Assets are matched on the
  stored manifests as written plus `image_url`, never the parsed form,
  which hides a share card next to a photo and every avatar the merge
  still copied.
- Scores: stored scores of old rows were frozen by earlier formulas, so new
  scores are fresh `rankScore` values at the 72h point times a stored/fresh
  scale (the canonical's own for the canonical, the plan's median for
  restored rows).
- Sends nothing. A group whose canonical or rows were published inside
  `UNMERGE_QUIET_SEC` (8 days: the rolling weekly mail lists D-7..D-1,
  trending and Facebook read 24-48h) is skipped until it ages out. Writes no
  `notifications`, `tldr_snapshots`, digest or weekly rows.
- One D1 batch per canonical. It opens with one `admin_audit` insert per
  write target (`unmerge.row`, `unmerge.sources`, `unmerge.translation`),
  each holding the target's before and after. The insert's `action` is
  `(SELECT ? WHERE <guard>)`, and the guard is every value the plan read: an
  `items` row's `status`, `duplicate_of`, `points`, `comments`, `tags`,
  `image_url`, `media_manifest` and `rank_score`; an item's whole
  `item_sources` list; the absence of the VI `translations` row. If any
  target changed after the plan read it, `action` is NULL, the NOT NULL
  constraint fails, and D1 rolls back the whole batch, so a stale plan
  writes nothing. The response lists those canonicals in `stale`; a rerun
  re-plans them. An `unmerge.canonical` row closes the batch with the pair
  outcomes and lossy notes. A repeat run is a no-op.
- Every audit row of one request has the same `ts`, returned as
  `applied.batchId`. `POST /api/admin/unmerge/undo` with
  `{ batchId, canonicalIds?, dryRun? }` (`agent unmerge --undo <batchId>
  [--canonical <id,...>] [--apply]`, a dry run by default) writes each
  target's before back through the same guarded batch, as `unmerge.undo.*`
  rows. `canonicalIds` (full ids only) limits the undo to those canonicals'
  change sets. The apply wrote each canonical as its own atomic batch, so one
  can be undone without the rest. An id the batch did not write is a 400,
  and the CLI refuses any flag its command does not read, so a typo never
  undoes the whole batch (#795). With `--canonical`, `--apply` first asks
  the deployed endpoint for a dry run and stops unless it plans exactly the
  named canonicals. A canonical is undone only while every
  target still holds what the apply wrote (`undo`); one already back is a
  `noop`, and anything else is a `conflict` that writes nothing. Undo does
  not touch what later jobs wrote, such as `backfill-translate` and
  `backfill-en-summary` rows for the restored items. Each apply request is
  its own batch, and a later batch can write rows an earlier one wrote (a
  rerun re-points into a lead the first batch restored), so undo the newest
  batch first. A batch that fails for a reason other than a guard stops the
  request; the response still carries `batchId` and names the canonical in
  `failed`. If a response is lost, the batch ids are
  `SELECT DISTINCT ts FROM admin_audit WHERE action LIKE 'unmerge.%' ORDER BY ts DESC`.
  A target the apply only guarded (a live twin that gained merged rows and
  no new values) holds both values, so it never blocks an `undo` or a
  `noop`.
- A restored row that turns out to be live next to another copy of its
  story: undo its canonical (`--canonical`), which puts the row back under
  that canonical as `merged`, then run a pairs entry for it with `sameAs`
  naming the live copy, which re-points it there as ingest would have. A
  `sameAs` pair alone does nothing while the row is `published`
  (`noop:already-unmerged`).

#### Dangling merges (#791)

Until `049e36df` (2026-10-03) `normalizeClusters` kept any id the cluster
call returned, so a made-up id (`abc123`, `ghi789`, `22`) became
`duplicate_of`. The merge also wrote the cluster's source union under that
id. Those rows are hidden and no row holds their story.
`POST /api/admin/unmerge` with `{ dangling: true, decisions?, dryRun? }`
restores them (`agent unmerge --dangling [decisions.json] [--apply]`, a dry
run by default, the same SELECT-only local plan). It finds every merged row
whose `duplicate_of` names no item and needs no pairs file.

- Stories: rows are one story when `sameStoryRule` says so (one URL, one
  aggregator slug hash, one article id, an exact title from another
  source). Among rows that one cluster call gave the same made-up id, a
  near-duplicate title (`isLikelySameEvent`, the title pass's rule) joins
  two such stories. It joins each story at most once, so similarity never
  chains unrelated headlines in a 28-row cluster.
- Each story is routed and written as an unmerge group: the same live-twin
  check (identity re-points to the live row, a near-duplicate of a live row
  waits as `needs-decision`), the same relevance bar (`rejected` under
  0.4), the same quiet window, the same replay through the merge planner
  and `planNewItemWrite`. The scale for scores is the median `storedScale`
  over the published rows of the same days.
- Decisions: `{ mergedId, sameAs }` or `{ mergedId, distinctFrom: [...] }`
  on any row of a story settles it as a pair's decision settles its group.
  A bare `distinct` is refused: there is no canonical to be distinct from.
  An id that names no item is refused, so a typo fails loudly. A row that
  is no longer dangling was restored by an earlier apply, so a rerun with
  the same file passes. Two different decisions on one story hold it. A
  `sameAs` story counts as a live copy of the row it names, so a
  near-duplicate story waits for its own decision against that row. The
  apply posts the same decisions, so it plans what the dry run printed.
- Sources: `attributeSources` with no canonical reads the rows under the
  made-up id. A leading run belongs to the member whose URL row ends it.
  The union was capped at 8 rows per made-up id, so most rows sharing a
  busy id (`abc123`) have no source row left; the plan lists them as
  lossy. The rows under the made-up id are read, never written, so every
  story's batch is independent. They stay behind, inert.
- One batch per story, keyed by its first row id, with the unmerge's
  guards, audit rows and undo. A rerun finds only the rows still dangling.
- Model check (#797): the title rules miss reworded headlines and late
  re-reports, so a story publishes only when a stored model verdict clears
  it. Without one it waits as `needs-model-check`; an apply writes it
  later. `POST /api/admin/unmerge/check` with
  `{ confirmLlm: true, decisions?, maxCalls? }`
  (`agent unmerge --dangling [decisions.json] --model-check --confirm-llm`)
  is the only step that calls a model. It judges each waiting story
  against the published rows within `CHECK_WINDOW_SEC` (7 days) of it,
  with ingest's cluster prompt on the production chain (task
  `unmerge-dup-check` in `llm_calls`, run id `unmerge-check-…`), then
  ingest's cluster gate (`gateLlmClusters`), split per story so only a
  story's own headlines back its links. Only live rows a story's headlines
  back are sent, since the gate drops every other link; a story no live row
  backs is cleared without a call. Stories are batched oldest first within
  ingest's per-call limits (100 new titles, 300 live rows).
  - Verdicts go to `unmerge_checks` (migration 0063), one row per story,
    keyed by its sorted row ids, with the kept matches, the links the gate
    or the 7-day window dropped, the live rows the model nearly named
    (`near-miss`: an answer that is a sent alias only once trimmed and
    uppercased, such as `e13`), the ids sent, the model and the operation
    id. Each request also returns `refs`, the counts of
    `worker/cluster-refs.ts` summed over its calls. A story whose rows
    change, or a verdict of another `CHECK_VERSION`, reads as no verdict.
    `CHECK_VERSION` is a hash of the cluster prompt and
    `CLUSTER_GATE_VERSION`, so a prompt change re-checks every story with
    no hand bump; a test pins the gate's decisions on the #728 labels, so
    a gate change fails it until `CLUSTER_GATE_VERSION` is bumped (#802).
    The live rows are not part of the key: an apply that publishes a
    restored story does not make other verdicts stale.
  - A kept match holds the story as `needs-decision` with the matched
    published story as its candidate. It never re-points: a model match is
    evidence, not identity. `sameAs` or `distinctFrom` settles it;
    `distinctFrom` overrules a match only with the stories it names. A
    failed call, an exhausted chain or an answer with no `clusters` array
    stores nothing, so it never reads as clear.
  - A request makes at most `maxCalls` calls (default 3, at most 10),
    starts no batch after 120 s, and stops after any 429 (#656) or chain
    failure, storing only whole batches. A rerun skips stories with a
    current verdict, so a check with nothing new calls no model. The CLI
    prints the call estimate from SELECTs first and needs `--confirm-llm`;
    it repeats requests until no story waits or `--max-calls` (default:
    the estimate) is spent, and after a 429 waits 150 s (past the chain's
    2-minute skip of that model), doubling up to 15 min, and gives up
    after three 429 stops in a row.
  - Replay: `scripts/unmerge-check-eval.ts` runs the planner, prefilter,
    batching and gate on a cached snapshot with a stub in place of the
    model, or on verdicts exported from `unmerge_checks`.

### Tag backfill (admin)

`POST /api/admin/tags/backfill` with `{ dryRun? }` re-tags published
stories stored with `tags = '[]'` before ingest had fallback tags. It also
re-tags the canonicals an unmerge leaves untagged (#758), so run it after an
unmerge apply reports `untaggedCanonicals`. It is a dry run unless
`dryRun: false`. `agent backfill-tags` plans locally from production D1
through `wrangler d1 execute`, SELECT only, and `--apply` posts to the
endpoint, which re-plans from live rows. Neither calls a model.

- Each untagged published story gets `fallbackTags` on its own title and
  source. The plan sorts the stories into three lists:
  - `tag`: stories it names something for, with the tags to write;
  - `noMatch`: stories it names nothing for, which stay `[]`;
  - `recent`: stories younger than `RANK_RECOMPUTE_WINDOW_SEC` (72h).
    Every ingest rewrites their `rank_score`, which would turn their undo
    into a conflict, so they wait for a rerun after they age out.
- The apply writes only `items.tags`. It uses the unmerge's guarded batch
  (`changeSetStatements`), one batch per story under one batch id. Each
  story gets an `unmerge.row` audit row whose guard holds every
  `ROW_STATE_COLUMNS` value, and an `unmerge.canonical` row with
  `tagBackfill`. A story changed after the plan read it is not written
  and is listed in `stale`. A rerun finds only the stories still untagged.
- Undo is `agent unmerge --undo <batchId> [--apply]`, the same endpoint as
  an unmerge undo. It puts `[]` back on each story that still holds the
  tags the backfill wrote. A story a later write changed (a merge added
  tags) is a `conflict` and is left alone.
- Not written, so undo does not touch them either: `topics` counts,
  `topic_daily`, `learned_keywords` and `/trends`. A story counts there on
  the day ingest saw it. `?tag=` filters, card topics, title highlight,
  RSS categories and trending chips read `items.tags`, so they change.
- After a backfill re-tags an unmerge's canonical, that unmerge's undo
  reports `conflict` for it until the backfill batch is undone. Undo the
  newest batch first, as for unmerges.

## Day archive (`/date/YYYY-MM-DD`)

Read-only page per **audience day** (`Asia/Ho_Chi_Minh`, the key
`tldr_snapshots.date` and the Telegram/email editions use, §10–12): the
snapshot stored under that date, then every published item with
`published_at` inside that ICT day ordered by `rank_score` (one group,
bounded to 500, no source-share cap), plus the nearest earlier/later day with
stories. The homepage feed buckets that same ICT day (`groupByDay` via
`archiveDateOfSec`), and `before` pages end at that day's ICT midnight, so a
heading's Full day link is the archive that contains the story. `getDayArchive`
(`src/lib/feed-queries.ts`) never writes — unlike `getFeed` it does not
rebuild a snapshot. 404 for a malformed date, a date after today (ICT), or a
day with neither stories nor a snapshot. With `?lang=`, days older than 3
days (ranks frozen, §7) cache for a day at the edge; recent days for 5
minutes. Without `?lang=` the response is private, like story pages;
both forms sit in the Worker cache (`edge-cache.ts`) keyed by the explicit or
resolved language, as story pages do. The same applies to `/week/YYYY-Www`.

Optional media lives in `day_videos` (`date` PK, `youtube_id` 16:9 shown on
md+, `short_id` 9:16 shown on mobile, `title`, the same three as `*_vi`,
`added_by`, timestamps; at least one of the four ids). Each language shows only
its own columns: no fallback between `en` and `vi`. Within a language each id
falls back to the other at the other breakpoint; breakpoints are CSS, so SSR
HTML stays cacheable. Set with `PUT /api/admin/day-videos/:date`
`{ lang?: "en"|"vi", video?, short?, title? }` (YouTube URL or 11-char id;
`null` clears a field, omitted keeps it; `lang` defaults to `en`), remove with
`DELETE` (`?lang=` clears one language), or the `set_day_video` /
`delete_day_video` admin MCP tools, or
`agent day-video <date> [--lang vi] --video … --short …`. Ids are validated
server-side. Post a language's video to Telegram with
`POST /api/admin/day-videos/:date/telegram` `{ lang, chat_id? }` (default chat
`TELEGRAM_EN_CHAT_ID` / `TELEGRAM_VI_CHAT_ID`; `sendPhoto` of the maxres
thumbnail, text fallback), the `send_day_video_telegram` MCP tool, or
`agent day-video-telegram <date> --lang en|vi [--chat <id>]`. The player is a
click-to-play `youtube-nocookie.com` facade.

The Telegram digest gets a second button, "▶ YouTube"
(`https://youtu.be/<id>`, the language's 16:9 id, else its Short), when the
day has a video in that channel's language. The video is usually uploaded
after the 08:00 digest, so a set (and a post to the language's own channel,
not a `chat_id` override) also edits the sent digest with
`editMessageReplyMarkup`, using the chat and message id on the digest's
`notifications` row (`status = 'sent'`). Clearing the video removes the
button; `DELETE` does not touch it. "message is not modified" counts as done,
and a failed edit never fails the admin call: the response says what happened
in `digest_button` (`updated`, `no sent digest`, `edit failed: …`).

## Agent read surfaces

Agents read the published edition. They never trigger a run. Every surface
renders from the same D1 reads as the pages, one language per response, with
no fill-in from the other language.

- Markdown twins: `/index.md` (the homepage, from `getPublicDigest`),
  `/date/YYYY-MM-DD.md` (TL;DR, video, up to 100 ranked stories with host and
  a summary for the top ten, capped at 44,000 bytes and the rest counted),
  `/week/YYYY-Www.md`, and `/api/story/{id}.md` (alias `/{id}.md`).
- `Accept: text/markdown` on `/`, `/date/…`, `/week/…` or `/{id}` returns the
  twin when Markdown ranks at least as high as HTML (`src/lib/markdown-negotiation.ts`).
  Both variants of those paths carry `Vary: Accept`, because Workers Cache
  keys on Vary and serves hits before the Worker runs.
- Anonymous MCP read tools (`POST /api/mcp`, also WebMCP): `latest_ai_news`,
  `search_news`, `get_story`, `get_ai_digest`, `get_day_edition`. The
  contract is `src/lib/public-read-tools.ts`; arguments are validated before
  any D1 read. `get_day_edition` returns the same Markdown as
  `/date/{date}.md`.
- `/llms.txt` lists the entry points; `/llms-full.txt` appends today's
  homepage Markdown.

### Usage counters (Analytics Engine)

`src/lib/usage.ts` writes one data point per request to the `USAGE` binding
(dataset `aidr_usage`, `[[analytics_engine_datasets]]` in `wrangler.toml`).
`src/server.ts` records RSS (`/feed.xml`, `/rss.xml`, `/feed.json`),
`llms.txt`, `llms-full.txt`, the Markdown twins (including `Accept:
text/markdown` negotiation) and the public `/api/public`, `/api/feed`,
`/api/story/{id}`, `/api/week/{week}` routes. `worker/admin/mcp.ts` records one
point per MCP `tools/call`. Routes outside that allowlist are not counted, so
scanners cannot grow the dataset. Layout: `blob1` surface, `blob2` route
template (ids, dates and weeks replaced, no query), `blob3` MCP tool (or empty),
`blob4` client bucket (`mcp-client`, `feed-reader`, `browser`, `bot`, `other`),
`double1` 1, `double2` HTTP status, `index1` surface. No IP, user agent or
query string is stored. Without the binding the code is a no-op, and a
`writeDataPoint` error is swallowed. A negotiated Markdown response counts only
for the negotiable pages (`/`, a story id, `/date/:date`, `/week/:week`); any
other path that answers `text/markdown`, such as a 404, writes nothing.

The counts are a floor, not request totals. Workers Cache (`[cache] enabled`)
answers `/api/public`, `/api/feed`, `/api/story/{id}` and `llms.txt` before the
Worker runs, so those count about once per cache TTL per key per location.
`/feed.xml` is served from the Worker's own `cachedLocaleResponse` inside the
wrapper, so feed hits do count. Compare surfaces week over week, not as
absolute traffic.

The Worker's own cache (`edge-cache.ts`) keeps an SSR entry fresh for the
page's `s-maxage`, then serves it stale for up to `EDGE_CACHE_STALE_S` (1h)
while one background render per key per isolate refreshes it, so a colo
re-renders off the request path instead of on it. For the homepage policy
(`s-maxage=300, stale-while-revalidate=600`) a reader without a browser copy
sees a render at most 80 minutes old: 5m fresh + 1h stale in the Worker, then
5m + 10m at the CDN. `Server-Timing: aidr-cache`
reports `HIT`, `STALE`, `KV` or `MISS`; web-vitals splits by the same value.
The same header carries the request's stages (`request-timing.ts`): `cache`
(the Worker cache lookup), `d1` (through the end of the feed batch), `ssr` (the rest of the render), then
`total` and `iso` (this isolate's request count). Each `dur` is the I/O
waited on since the previous mark.

The homepage also has a tier shared by every colo: KV (`HTML_CACHE`,
`global-html-cache.ts`) holds the same stored entry for its four keys (bare
`/` and `/?lang=` in each language; a `?q=`, `?tag=` or any other param stays
local). Keys start with the deployed version id (`CF_VERSION_METADATA`), so a
copy never names another build's chunks. A colo with no usable local copy
reads KV before it renders: a fresh or stale copy is served as `KV` and
copied into the local cache with its original `x-aidr-stored-at`, so the
fresh and stale windows still count from the render. A local STALE entry
checks KV first and takes a fresh copy without rendering. A render writes KV
only when the KV copy is absent or at least `GLOBAL_WRITE_INTERVAL_S` (600 s)
old: about 4 keys x 144 a day = 576 in steady traffic, plus one per key
after each deploy (new version prefix) and the rare race of two colos that
render inside KV's visibility window, against the Free plan's 1,000. The
TTL is fresh + `EDGE_CACHE_STALE_S`. KV is eventually consistent, so a colo
may read a copy up to about 60 s older than the newest write;
`x-aidr-stored-at` still bounds its age. A failed read or write (an outage,
the daily write quota) is swallowed: that colo falls back to its own cache
and renders. Each document served through the Worker cache logs one
`{ event: "html-cache", state, path, lang, age, global }` line to Workers
Logs (no cookie, URL or user agent).

There is no read endpoint yet: querying needs an account API token secret that
the Worker does not hold. Weekly totals, run against the Analytics Engine SQL
API (`POST /client/v4/accounts/{id}/analytics_engine/sql`):

```sql
SELECT toStartOfWeek(timestamp) AS week, blob1 AS surface, blob2 AS route,
       blob3 AS tool, blob4 AS client, SUM(_sample_interval * double1) AS hits
FROM aidr_usage
WHERE timestamp > NOW() - INTERVAL '90' DAY
GROUP BY week, surface, route, tool, client
ORDER BY week DESC, hits DESC
```

## Ops pitfalls

- `LLM_STEP` and `BACKFILL_TRANSLATE_STEP` use `retries: 0` and a 5-minute
  timeout, above `TRANSLATE_TIMEOUT_MS`, so a slow translate can return and
  write. `TLDR_STEP` uses one retry (`limit: 1`, `delay: 10_000`) and a
  4-minute timeout, because a Durable Object reset used to fail the edition
  for the rest of the hour. A failed score/TL;DR call must not abort close-run.
- Just before close-run, the `health-check` step (`worker/health.ts`)
  reports to Sentry/Bugsink when: a Telegram channel has no post for >26h
  (a missed daily digest; checked during local 09–23h), >50% of the run's
  LLM attempts failed (min 4), TL;DR failed 3 runs in a row, a step failed, or the run errored. Fired keys go
  in `stats.alerts`; the same key is silent for 6h. External uptime
  monitors poll `GET /api/health` (503 when the newest run is down).
- English left in Vietnamese (`worker/translation-english.ts`, same step,
  no model call): the translate and backfill-translate steps count the
  EN→VI rows they write per served model (a kept repair counts for the
  repair's model) in `stats.viEnglish`, with the rows whose **summary** has
  no Vietnamese diacritics (`looksVietnamese`). Titles are not judged: the
  prompt keeps a paper title it cannot render, and product names with
  versions, in English on purpose, and those cluster by source (arxiv-research,
  hf-papers) and swing with the day's mix. The blind spot is a model that
  leaves every title English under a Vietnamese summary; a half-translated
  summary is not counted either. The check sums
  the last 24h of live runs plus this one and raises
  `translation-english:<model>` (warning; Telegram DM, and a GitHub issue in
  `duyet/aidr` only when `GITHUB_ALERT_TOKEN` is set, see below)
  when a model wrote ≥ 40 rows and > 10% kept English (5 of 40, 9 of 80, 13 of 120). A key fires once per
  24h: the check reads the window's `stats.alerts`, not the 6h cooldown.
  Baseline, 7 days to 2026-10-14, items attributed by fetch run, summaries
  only: gemini 1/558 (0.2%), Laguna 2/78 (2.6%), gemma-latest 0/36. Judging
  titles too read 7/558 (1.3%), 5/78 (6.4%) and 3/36 (8.3%); all the
  difference was kept titles, so a paper-heavy day could have false-alerted.
  No 24h window reached 10% either way. At 10% a model whose true rate is 2.6% false-fires 0.37% of 40-row windows and 0.024% of 80-row windows, while one at 10% fires 37-41% of them (15% would catch it only 5-10%). The daily summary lists each
  model's 24h count.
- Cluster model linking unrelated stories (`worker/cluster-gate.ts`, same
  step, no model call): the check sums `stats.clusterGate` over the same
  24h window plus this run and raises `cluster-unrelated:<model>`
  (warning, routed to `duyet/aidr`) when a model proposed ≥ 20 links to
  existing stories and the gate rejected > 10% of them. Once per model
  per 24h, like `translation-english`. Baseline from rolling 24h windows
  every 30 min with 20+ links, 2026-09-28 to 10-14. The denominator is
  links into existing stories that merged, title-pass links included, not
  the links the model proposed. `llm_calls` starts 10-07, so links before
  it count as Laguna (every recorded cluster call before #541 is
  Laguna). Laguna over the whole era: median 6%, p90 25%, max 36%, above
  10% in 172 of 494 windows, all ending between 09-30 18:00 and 10-04
  11:30 UTC (the merges of 09-30 to 10-03). Laguna
  attributed by `llm_calls` (10-07 to 10-10): median 2.6%, max exactly
  10%, so this rule would not have fired then. gemma-latest: median 0%,
  max 2.7%, 1 of 95 links overall. A model at 1.1% false-fires 0.12% of
  20-link windows; one at Laguna's era mean (10.4%) fires 35-51% of them,
  one at 25% fires 91-99%. Re-measured with the #745 gate over 09-30 to
  10-14 (431 links): Laguna windows above 10% rise from 63 to 120 of 371,
  Laguna by `llm_calls` (10-07 to 10-10) max 6.7% -> 9.1%, and the
  windows from 10-10 14:00 (gemma-latest, glm-latest) stay at median 0%,
  max 4.3%, none above 10%.
- Image coverage collapse (`worker/image-coverage.ts`, same step, no model
  call): one D1 read per run gives each source's published items with a
  usable image over 24h and 7 days. Usable is `image_url` set, or a media
  manifest with an image asset or a video with a poster (the Telegram photo
  path's test). A source is eligible when it has ≥ 21 items in 7 days and
  ≥ 60% coverage over them. It raises `image-coverage:<source>` (warning,
  routed to `duyet/aidr`) when it has ≥ 4 items in 24h and the 24h share is
  under half its 7-day share. Once per source per 24h, like
  `translation-english`: the check reads the window's `stats.alerts`, not
  just the 6h cooldown. Sources that rarely have pictures sit under the 60%
  bar and never alert. Baseline, 7 days to 2026-10-16 (24h / 7d coverage,
  items a day): marketbrief 100% / 100% (27), huggingnews 100% / 100% (16),
  techmeme 100% / 100% (15), hn 83% / 80% (13), techcrunch-ai 100% / 98% (7),
  theverge-ai 100% / 100% (4), the-decoder n/a / 96% (3); exempt by baseline:
  lobsters 44% / 54% (7), hf-papers n/a / 53% (5), arxiv-research 83% / 38%
  (3), simonwillison 0% / 36% (2), openai 0% / 0% (1). `agent audit` prints
  every source's two shares under `imageCoverage` (from
  `/api/system/sources`) and counts the ones that would alert now. The
  7-day share includes the 24h being judged, so a total collapse of a
  high-volume source barely moves its own baseline.
- Owner alerts (`worker/owner-alerts.ts`, same durable step, both optional):
  `TELEGRAM_OWNER_CHAT_ID` DMs each freshly fired alert (same 6h cooldown)
  with evidence and the run link, plus one daily summary in the first run
  between 09–12h local (`daily-summary:<date>` in `stats.alerts` makes it
  once per day). `GITHUB_ALERT_TOKEN` (fine-grained PAT, Issues read/write)
  files `aidr-alert` issues, and only when it is set (it is not set on the
  Worker today, so the Telegram DM is the only report; a run that fires
  alerts logs one `GITHUB_ALERT_TOKEN is not set` warning naming them): LLM keys → `duyet/anyrouter`, others →
  `duyet/aidr`. An open issue with the same fingerprint gets a comment at
  most once per 24h instead; max 3 GitHub writes per run. Errors are logged
  and sent to Sentry, never fail the step.
- Owner DMs take only a Telegram user id (positive digits): `@name` and
  negative group or channel ids are refused without a call. The
  new-subscriber ping (`worker/subscribe/owner-notify.ts`) carries the
  subscriber's email, so it uses the same `sendOwnerDm` and never a language
  channel id; with `TELEGRAM_OWNER_CHAT_ID` unset only the
  `OWNER_NOTIFY_EMAIL` email goes out.
- Daily video watchdog (`worker/day-video-watchdog.ts`, same step): during
  20–23h local (13:00–16:00 UTC) it confirms the day's video against each
  record: `day_videos.youtube_id`, `short_id` and `youtube_id_vi` (the
  Vietnamese page's video, the subtitled or the Vietnamese-voice cut), a
  Page Reel whose caption mentions `aidr.today/date/<date>` (Graph, the
  Worker's Page token), and a `day_video_posts` row per Telegram channel
  (`telegram-en`, `telegram-vi`; migration 0062). Telegram cannot be read
  back, so the post path writes that row: `publish.mjs --steps telegram
  --prod` after each channel post (`agent day-video-posted` →
  `PUT /api/admin/day-videos/:date/posts`, an upsert; every --prod run
  records the posts already in `STATUS.json` again, so a failed record is
  filled in by the next run), and the Worker's card post
  (`POST /api/admin/day-videos/:date/telegram` without `chat_id`). The
  20h start is the deadline: the 02:30 UTC cron fired 7 h late on 10-12 and
  10-13, this repo's 06:17 UTC `live-budget` cron fired up to 9 h late, and
  the English posts took under 20 minutes, so even a 9 h late run has
  posted by 13:00 UTC. The
  `daily-reel.yml` runs of the date (GitHub API, with `GITHUB_ALERT_TOKEN`
  when set, else without a token from shared Cloudflare IPs) are context
  only: the latest run's link in the alert, and a live run (not titled
  `(dry run)`) still in progress waits. A run's date is the `date` input in
  its `run-name`, else the local day it was created. A failed GitHub lookup
  only loses that context. Once every target is confirmed,
  `day-video-ok:<date>` in `stats.alerts` skips the rest of the evening's
  checks. A missing target raises `day-video-missing` once a day, with the
  rerun command
  (`gh workflow run daily-reel.yml -R duyet/aidr -f dry_run=false -f date=<date>`).
  A failed lookup, or a run of the date still in progress, waits for the
  window's last check (the first run whose next ingest starts after 23h);
  if that run never comes, it is not reported. The rerun skips every post
  already made (the cached `STATUS.json`, the day page, the Page's Reels),
  so it fills only the gaps; rerun before local midnight, since a past date
  needs a committed `videos/daily-news/editions/<date>/edition.json`. On a
  hand-published day (`HAND_PUBLISHED`) the workflow skips Telegram, so a
  missing Telegram post there is posted by hand:
  `node scripts/publish.mjs <date> --lang en --steps telegram --prod`
  (`--lang visub` for the Vietnamese channel), which records it.
- `run()` still upserts at start **before** `pruneLlmCalls` / fetch / LLM.
  Do not wrap `open-run` in `safeStep`.
- Per-model caps in `worker/llm.ts`: score `SCORE_SLICE_MAX_MS` 70s, TL;DR
  `TLDR_SLICE_MAX_MS` 135s, translate first token `TRANSLATE_FIRST_TOKEN_MS`
  35s. Cluster (`worker/dedupe.ts`): `CLUSTER_SLICE_MAX_MS` 45s inside the
  120s `CLUSTER_TIMEOUT_MS`. Served cluster calls finish within 30s; at 90s
  a stalled first hop left each later id 13.3s, under the 20s first-token
  cutoff (#672). Each extra chain id also holds back a fallback floor: with
  `anyrouter/auto` as a fifth id, the last id got 18.3s after a stalled
  first hop; without it, 35s.
- Do not treat GitHub Actions SUCCESS as a finished ingest. Poll
  `GET /api/system` (no-store) until `lastRun.id` matches the POST `id`
  (or at least is no longer the previous id) and `runsToday > 0`.
- Do not invent a `:05/:20/:35/:50` schedule fire.

## Pipeline (per ingest run)

### 1. Fetch

Each enabled source row (`sources` table) maps to an adapter
(`worker/sources/registry.ts`): HN via Algolia: the front page plus every
story at `popularMinPoints` (20, migration 0069) or more in the window,
kept when the title passes the AI-keyword pre-filter. No search sends an
Algolia `query`, and a `query` key in the row is ignored: HN Algolia
requires every query word, so `AI OR LLM` required the word `OR` and
matched nothing (#873). An unfloored keyword search would add over 250 AI
posts a day, 70% of them under 5 points, so there is none. Over 48h on
2026-10-16 the 20 floor added at most 14 stories the front page had missed,
under one per run, so HN has no `maxItems` (newest-first would cut the late
risers the floor exists for),
HuggingNews via its `__data.json` (+ per-story detail for body/sources),
Lobsters via `/t/{tag}.json` (`ai` / `ml` / `vibecoding` by default; broad
`filteredTags` such as `programming` keep only AI-keyword titles),
generic RSS (`openai`, `google-ai`, `hf-blog` feeds), Anthropic Newsroom
HTML (`/news` listing — no official RSS), xAI News via sitemap
(`https://x.ai/sitemap.xml` `/news/<slug>` locs + `/news` listing titles),
MarketBrief AI hub via `/{topic}/__data.json` (default topic `ai`;
war/politics stay out). Extra RSS: `deepmind`, `aws-ml`, `google-dev`,
plus lab/vendor blogs and newsletters added in migration 0044 (`mistral`,
`nvidia-blog`, `nvidia-dev`, `microsoft-research`, `apple-ml`,
`together-ai`, `github-ai`, `latent-space`, `interconnects`, `import-ai`,
`bens-bites`, `ahead-of-ai`; broad feeds use `keywordFilter: "ai"`, each
has a 2–4 `maxItems` cap). Migration 0057 (2026-10-11) disables the sources
that refuse Workers egress and adds the probation sources in the table below.

#### Source table (migration 0057 changes)

| id | adapter | family | state | decision |
| --- | --- | --- | --- | --- |
| `reddit-ml`, `reddit-localllama`, `reddit-singularity` | `rss` | `reddit` | disabled | Reddit refuses Workers egress: `fetch_failed` on all 135+ runs, 0 items. |
| `xai` | `xai` | n/a | disabled | x.ai answers the Worker with HTTP 403: 517 runs, 0 items. |
| `ahead-of-ai` | `rss` | n/a | disabled | 0 items in 409 runs. The feed is alive (newest post 2026-09-29, one every two to three weeks), so this is a quiet-feed call. |
| `arstechnica-ai` | `rss` | n/a | enabled | Re-pointed to `feeds.arstechnica.com/arstechnica/technology-lab` with `keywordFilter: "ai"`; the old URL failed on 517 runs. 7 of 20 titles pass the filter. |
| `mistral` | `rss` | n/a | unchanged | No code bug. The feed parses (89 items); its only post since seeding, Mistral Large 4, was already stored from `docs.mistral.ai`. |
| `release-ollama`, `release-vllm`, `release-transformers`, `release-codex` | `githubreleases` | `oss-release` | probation, 1 per run | GitHub REST API, `x.y.0` tags only. |
| `hf-papers` | `hfpapers` | `hf` | probation, 2 per run | Daily papers, top by upvotes; upvotes are not engagement. |
| `openrouter-models` | `openrouter` | `openrouter` | probation, 2 per run | Models with `created` inside the since-window; `:variant` ids skipped. |
| `hf-models-qwen`, `-deepseek`, `-moonshotai`, `-zai-org`, `-mistralai` | `hfmodels` | `hf-models` | probation, 2 per run | New release repos of one organization; quantized, adapter, SAE, draft and conversion repos skipped. |
| `hf-trending` (migration 0064) | `hftrending` | `hf-models` | probation, 2 per run | Release repos on the Hugging Face trending list, created within 14 days, ranked by `trendingScore` and sent 2 per run in a rotating window; the score, likes and downloads are not engagement. |
| `ai2` | `rss` | n/a | probation, official | `allenai.org/rss.xml`. |
| `genk-ai` | `rss` (`sourceLang: "vi"`, `timezone: "+07:00"`) | `vi-press` | probation, 2 per run | Second Vietnamese row, so the VI→EN path runs again while `vnexpress-tech` is off. |

Decisions behind the table:

- **GitHub releases use the API, not `releases.atom`.** `github.com/robots.txt`
  disallows `/*.atom$` for `User-agent: *`, and no source may fetch what a
  robots.txt disallows. `api.github.com` serves no robots.txt. Titles are
  `"<project> <tag>"` (a bare tag gives the scorer nothing); the body is the
  summary. llama.cpp is not added (its tags are build numbers such as
  `b11552`, so no minor release can be told apart) and neither is Claude Code
  (`2.1.N`, a minor bump almost never happens).
- **Shared hosts.** `sourceSpecForUrl` maps a link to the registry row whose
  `homepage` or `feed` host serves it. The github, huggingface and openrouter
  rows therefore carry no `feed` or `homepage` (they use `repo`, `author`),
  and none is `official`; an HN link to any github.com page keeps `hn`.
- **Trending covers the organizations no org feed names.** The five
  `hf-models-*` feeds stored 2 rows in the 7 days to 2026-10-16. That day, 6
  of the top 15 trending models were release repos created in the previous 16
  days, none was stored, and 5 came from organizations no feed names
  (openbmb, LiquidAI, fishaudio, speridlabs). `hf-trending` keeps a repo
  created within 14 days, because a model trends days after upload and the
  26h since-window would miss it. `published_at` is the upload date, so a
  trending row older than 24h never enters the edition window on its own; it
  adds a source to a story when it merges into a live cluster (the existing
  canonical keeps its date) and otherwise lands on its upload day's archive.
  The 14-day gate is a cut-off, not a guarantee: drama-3, uploaded
  2026-10-01, was already past it on 2026-10-16. The cap is applied before
  ingest drops already-stored URLs, and the adapter keeps no state, so a
  head-only cap would re-send the same top 2 every run. Instead the 2-item
  window starts at `(slot * 2) mod n`, one slot per 30-minute ingest
  interval, and wraps: every candidate is sent within `ceil(n / 2)` runs and
  a repeat is dropped as already stored. Ties are ordered by id so the window
  does not shift when the API returns them in another order.
- **OpenRouter keeps no cursor.** Adapters get only `(config, sinceEpochSec)`
  and none persists state, so "new since the last run" is `created` inside the
  26h since-window; a model seen on a previous run has the same URL and
  ingest drops it as already stored.
- **Timezone.** `timezone` is a fixed UTC offset applied only to a date that
  has no zone; `Date.parse` is never used for those, because it reads the host
  timezone. GenK's live feed already says `+07`, so the key is a guard.

#### Probation

A new source starts with `probation: true` in the catalog. The rule, held by
`worker/__tests__/source-catalog.test.ts`:

- at most 2 items per run (1 for the `oss-release` family);
- no `engagement: "reader"`, and no `points` or `comments` from the adapter;
- `official` only for a first-party feed on its own host (it makes a row the
  canonical over aggregator rewrites, so a shared-host row never gets it);
- a `family` for related feeds, so they count once in `sourceCount` and in
  `pickDiverse`.

A probation source graduates by deleting the flag, once it has delivered
accepted stories on its own for two weeks (`/api/system/sources`:
`accepted` against `fetched`). A source that is `failing` or `stale` in that
time is disabled instead.

The set of sources is **declarative**: one list in
`worker/sources/catalog.ts` generates the runtime seed, the migration, and
the `/api/system/sources` + `/data` surfaces, so a source cannot reach one
and miss the others. The seed upserts name, type and config (never
`enabled`) at the start of each ingest. The topic-learning schema setup
that runs later in the same ingest is DDL only, so it cannot undo the seed
(#871). An operator can also add or enable an `rss` row at
runtime through `upsert_source` with no deploy — see
[`worker/README.md`](worker/README.md) → "Add a source without a deploy".

- **Flood gate.** A high-volume feed is cut before the scorer sees it, in
  this order: event promos drop (see the next bullet), an optional named title pre-filter (`keywordFilter: "ai"`,
  the same regex HN uses; it admits inflections such as agents,
  fine-tuning, LLMs and benchmarks, and named frameworks, platforms and
  data tooling such as LangGraph, Workers AI, vector databases and
  embeddings, but never bare words like sdk, data or tools), then a hard newest-first `maxItems` cap applied
  after the since-window filter. The Vietnamese newsroom and the four AI
  newsrooms are capped at 6 items per run each, and so are the
  `marketbrief` / `huggingnews` mirror pair (their adapters go through
  the same `applyFloodGate` in `registry.ts`). Newest-first is what makes
  the cap safe: the 26h window means the head of the feed at the next run
  is exactly what was published since the last one, so the cap samples the
  live edge and dedupe drops the rest.
- **Event-promo gate.** Every adapter's output also drops TechCrunch
  event sales before dedupe (`worker/sources/event-promo.ts`, applied first
  in `applyFloodGate` so promos never take a `maxItems` slot, and again in
  `registry.ts` `normalized` for adapters with no gate; `fetched` in source
  health counts what is left after the drop): a `techcrunch.com` URL whose title pairs
  pass/ticket with a sale word (save, deal, early bird, last chance, pay
  more), "Exhibit at ...", a "N days/hours to Disrupt" countdown, or a
  `/events/` path. Other hosts are never touched. Measured 2026-10-16 over
  14 days of stored rows (3,230): 10 hits, all TechCrunch Disrupt or Founder
  Summit sales on `techcrunch-ai` (7 published, 2 merged, 1 rejected), 0 false positives; "Tesla Registers 43 Cybercabs" and
  "One Way Tickets to Saudi Arabia" stay in. Speaker, agenda, lineup and
  recap posts (#852) still pass to the scorer: some announce a lab's news.
- **Feed share cap.** The flood gate only bounds new rows, and a source
  that omits `maxItems` can still dominate the served feed. `marketbrief`
  is already capped at 6 by the flood gate. `getFeed`
  (`src/lib/feed-queries.ts`, `capSourceShare`) therefore also keeps each
  source family's top-`rank_score` rows so none exceeds 25% of the served
  feed (skipped below 4 distinct families; family as in the top-list cap
  below, so the mirrored aggregators share one 25%). It runs at read time, so historic
  rows are covered.
- **Top-list family cap.** The short ranked lists — homepage top stories
  (`PUBLIC_STORY_LIMIT`) and the trending pick — go
  through `pickDiverse` (`worker/source-diversity.ts`): at most
  `ceil(0.3 × list size)` rows per source *family* (8 → 3, 16 → 5). The
  TL;DR's 16 use the same cap through `selectEdition`, which lets one
  importance-8+ story per family past it (at most 6 of 16; see "10.
  TL;DR"). A
  family is `SourceSpec.family` in the catalog, else the source id;
  `huggingnews` and `marketbrief` share `aggregator` because they publish
  the same stories under the same slugs (they held 47 of the 24h top 50 on
  2026-10-01). Each list reads a wider ranked pool (homepage 120 rows,
  TL;DR the whole 24h window up to 300) so the cap has other stories to
  take; if the pool still runs short, the best skipped rows fill the tail
  rather than shrinking the list. Trending counts families across the
  local day (today's sent posts seed the count, 1 per family while
  another family qualifies); when only one family qualifies it still
  posts.
- **Public digest `stories` (`getPublicDigest`).** `GET /api/public`
  returns the top `PUBLIC_STORY_LIMIT` (8) stories plus every published
  item cited by a returned TL;DR bullet in either language (up to 16
  bullets x 8 `item_ids`), deduped and loaded by id (no 48h window),
  capped at `PUBLIC_STORY_MAX` (30) in total. Consumers can always resolve
  a bullet's `item_ids` in `stories`; ids past the cap or unpublished stay
  unresolved. The 50 KB body cap still trims tail stories. The homepage SSR
  payload is separate and unchanged.
- **Host pacing.** A row may set `minRequestIntervalMs` to serialise
  same-host fetches; the first request to a host is never delayed.
- **Explicit source language.** A row with `sourceLang: "vi"` puts its
  items on the VI→EN translation-QA path below. It is declared metadata,
  never inferred from diacritics.
- A source that returns a non-2xx, or a 200 that is really an HTML page,
  throws a typed `SourceFetchError` so the run records `fetch_failed` /
  `parse_failed` rather than reporting a quiet feed.

### 1b. Per-source health + staleness

Every source row gets a record in
`workflow_runs.stats.sourceHealth`: `fetched` / `scored` / `accepted` /
`rejected` / `merged`, a structured skip reason (`fetch_failed`,
`parse_failed`, `empty`, `all_rejected_below_relevance`, `disabled` — a
closed enum, never free text or a URL), and a count of consecutive
zero-item runs. The streak is **carried forward** from the previous run's
stats (one single-row read) rather than recomputed from run history, so
surfacing staleness on the read path costs nothing. A source at or over
its threshold is flagged stale in `/api/system/sources` and the `/data`
Algo tab: **336 consecutive runs** (7 days at the 30-minute cadence). That
number is measured, not round — 14 of the 21 registry feeds returned
nothing inside the 26h window when they were verified live, including
pre-existing ones that publish weekly, so the "e.g. 48 runs" in #230 would
have flagged healthy sources most of the weekend. A row may override it
with `staleAfterRuns` when a source's real cadence demands it; arXiv is
the known case (no weekend submissions, ~108 silent runs at 30 minutes) and is not in
the registry yet — see `ARXIV_NOT_ADDED_REASON` in
`worker/sources/catalog.ts`. A disabled source is reported `disabled`,
never `stale` — off is a decision, not a fault. This is observability
only: it changes no ranking, no prompt, and no LLM budget.

A second, shorter alarm covers broken fetches. `sourceHealth.failedRuns`
counts consecutive runs whose skip reason is `fetch_failed` (carried forward
like `emptyRuns`, reset by any other outcome). At **48 consecutive runs** (one
day; `FETCH_FAILED_ALERT_RUNS` in `worker/sources/catalog.ts`) the source is
listed in `failing` beside `stale` in `/api/system/sources`, flagged `failing`
in the `/data` sources table, and called out first in the Algo tab. The
336-run empty threshold missed this: a failed fetch is also an empty run, but
five sources sat at `fetch_failed` for 135 to 517 runs, so `xai` and
`arstechnica-ai` were flagged only after 336 runs and `reddit-*` never. A
quiet feed never sets `failedRuns`. Disabled and `push`
rows are exempt. Runs written before the field existed count from 0, so the
alarm arms about a day after the deploy.

### 2. Dedupe

Item id = `sha256(url)`; ids already in `items` are dropped. `publishedAt`
is normalized to epoch seconds and clamped to now (`toCandidates`): a feed
date in the future (no zone, wrong offset) would otherwise rank as brand new,
with the breaking boost, and stay in every 24h window for longer.

Exception: an official post already stored as a `merged` row (e.g. HN
linked it first, so the feed's copy has the same id) is re-run as a new
row when a fetch sees it again, it clears relevance, and it is a rewrite
match for its non-official canonical (see 5). It then takes the story over.

### 3. Enrich

Missing summary/thumbnail filled from the article page
(`og:description` / `og:image` / Twitter / JSON-LD / supported video
poster fields), capped and failure-proof (`worker/enrich.ts`). The ordered,
bounded `media_manifest` is stored alongside the legacy `image_url`; video
posters stay nested on the video asset and are never emitted as extra image
candidates. HTML entities in media URLs (including double-escaped `&amp;`
in query strings) are decoded before storage, so thumbs are real article
images rather than a broken-src fallback.

- **The trigger is a missing picture, not missing media.** A new item is
  fetched when its summary is empty or cut off, or when it has no thumbnail
  (`primaryThumbnailUrl`): no image asset, and no poster on the first-ranked
  video. Posterless videos alone (the-decoder's
  feed gives `.mp4` files and no image) still fetch the page, whose
  `og:image` and video posters give the picture (#805).
- **arXiv has no og:image.** When an item is an `arxiv.org/abs/<id>` page
  and the merged manifest still has no image, enrich fetches
  `arxiv.org/html/<id>` (same safe fetch, timeout, and a 400 KB read cap)
  and takes the first `<img>` whose `src` starts with `<id>v<n>/`, resolved
  against the final URL. A paper without an HTML version stays imageless.

- **Media identity is the URL, not the content.** Duplicates are found by
  `mediaIdentityKey` and collapse to one asset, in one manifest, across
  sources, and when a cluster merges (`buildMediaManifest` over every
  member's assets). Rules: http and
  https of a host are one identity; tracking query keys (`utm_*`, `fbclid`,
  `ref`, ...) and CDN resize keys (`w`, `h`, `q`, `fit`, `auto`, ...) are
  ignored; image extension and size suffixes are ignored (WordPress
  `-1024x576` and `-scaled`, `.large`, `-resize-640`); a Jetpack Photon URL
  (`i0.wp.com/<host>/<path>`) equals its origin file; an image equal to a
  video's poster is dropped (the video shows it); a marketbrief or
  huggingnews `/story-media/<tweetId>/<key>` mirror whose last segment is a
  15-character tweet media key equals `pbs.twimg.com/media/<key>` (the mirror
  names the file by that key). Signed-CDN query keys and
  any other query stay part of the identity, so distinct files stay distinct.
  The story dialog applies the same keys to stored manifests, so no asset
  renders twice. No media is downloaded or hashed: apart from the tweet
  mirror rule, two different URLs that serve the same bytes (a mirror, a
  renamed copy) stay two assets.
- **Avatars are not story images.** `isGenericImageUrl` rejects a
  filename that is a logo/icon/avatar/placeholder, any `avatar`, `avatars`,
  or `profile_images` directory before the filename, and `pbs.twimg.com`
  `/profile_images/` and `/profile_banners/` paths. `pbs.twimg.com/media/…`
  tweet photos stay.
- **Images are ranked in three tiers, and a manifest keeps only the best
  tier it has** (`withoutFallbackImages`). Tier 0 is real media. Tier 1 is
  an imgur upload (`isImageHostUpload`). Tier 2 is a generated share card,
  an image whose path is an OG generator (`/og/…`, `/api/og`,
  `og-image`/`og-card` file names, see `isGeneratedOgCard`). So a real image
  drops both, and an imgur capture drops the card: it still shows the story,
  while the card only shows the headline. A video is never dropped. It
  ranks by its poster's tier, so a video whose poster is a share card sorts
  after an imgur image. A video without a poster gives no picture, so it
  does not count, and the best fallback image stays after it. When the best
  tier is the card tier, only the first (highest-ranked) card stays, since
  aggregator cards for one story are near-identical. The rule
  applies to merged cluster manifests too. Techmeme and HN posts link imgur
  screen captures that carry the capturing desktop's window bars and
  tooltips. A `Screenshot-…` file name is not a signal: publishers
  (TechCrunch, The Verge) use it for clean editorial images. The story
  dialog applies the same rule to stored manifests at render time.
- **The story's own page is not story media.** Every build that can see
  the article URL takes it: `buildMediaManifest(…, { articleUrls })`,
  `parseMediaManifest(raw, imageUrl, url)` and
  `primaryThumbnailUrl(…, url)`. That covers the RSS parse, `parseOgTags`
  (the fetched page), enrich (the item URL and its source-kind URL), the
  cluster merge, the D1 write and every read path. The page leaves before
  ranking, matched by `mediaIdentityKey`, so `?w=600` and `http://` variants
  go too. A video whose poster is the page keeps the video and loses the
  poster. Removing the page after the tier rule ran would drop an imgur
  image or a share card for an asset that is then removed as well.
- **A video poster is only URL-checked here.** At collection time the
  poster URL passes the same URL policy as any image and nothing is
  fetched. Its bytes are checked later, at Telegram send time (see Notify).
- **Feed thumbs are served resized, from the story's own media.** A 48 px
  TL;DR thumb loads `/api/thumb/<item id>?u=<image url>`
  (`src/routes/api/thumb.$id.ts`). It takes only a full 64-hex item id and
  refuses a `u` that published item does not carry (`image_url` or a
  manifest image asset). That ownership read runs on every request before
  the edge cache, so once a story drops an image the Worker answers 404 for
  it. The 404 alone does not hide the image: `StoryThumb` falls back to the
  publisher URL on any load error, 404 included. The image goes when the
  page stops carrying it, which takes up to about 2 hours for edge-cached
  HTML (`EDGE_CACHE_FRESH_MAX_S` plus `EDGE_CACHE_STALE_S`) and a reload
  for an open tab. A browser that already loaded the thumb can keep it up
  to a day (`max-age=86400`) and show it once more within the next day
  while it revalidates (`stale-while-revalidate`); `s-maxage` lets a shared
  proxy outside Cloudflare keep it up to 7 days. That header only reaches
  the browser because `/api/thumb/<id>` is on the public API allowlist in
  `src/lib/route-indexability.ts`; the Worker stamps `private, no-store`
  on every other `/api/*` path except `/api/subscribe/preview` with a
  query, where `applyQueryPolicy` decides, so a new public API route must be
  listed there or its own Cache-Control is lost (issue #891). Any response
  that carries `Set-Cookie`, such as a Clerk token refresh, goes out
  `private, no-store` whatever its route (issue #898). The edge copy is keyed
  on item id, canonical `u` and `THUMB_RENDER_VERSION` only, so extra query
  parameters cannot force a new publisher fetch. The source fetch is capped
  at 8 MB and 5 s including the body, and is resized through the Images
  binding to a 144 px square WebP. TL;DR bullets take their image only from
  published items (`IMAGES_SQL`), the same rule the route applies. The
  2026-10-16 homepage carried a 1.1 MB publisher hero for one such box;
  the six thumbs went from 2.08 MB to 25 KB. A miss (binding
  absent, publisher down, non-image) 302s to the publisher URL, and the
  client steps to that URL on a hard error, so the thumb never disappears.
  The 302 is stored under the same edge key for 5 minutes (`max-age=300`),
  so a source that always fails (about 10 of 95 on 2026-10-16: FT 400,
  axios, geekwire and marktechpost 403) costs one publisher fetch per edge
  location per 5 minutes, not a fetch of up to 5 s on every request.
  The lightbox and the story-page gallery still use the manifest URLs as
  written; only the feed-size copy is derived.

### 4. Score (decision router, then Jev, then LLM)

Batches of 5.

- `ANYROUTER_DECISION_MODEL` is an optional System One router (such as
  `anyrouter/decision`) tried on each item before Jev, with the same
  questions and a 15s cap. An answer is used only if the response's served
  `model` is Jev (`jev-*`) on a TypeSafe provider
  (`anyrouter_metadata.upstream.provider`). Anything else is a miss that
  costs a second call to Jev, because only Jev's levels are calibrated.
  `llm_calls` records the served model in `route` and `provider`. Empty
  var → score starts at Jev. Production leaves it empty (#854). Over the
  7 days to 2026-10-16, `anyrouter/decision` made 1734 score calls. It
  served Jev on 66 of them and failed on 188. The other 1480 answers came
  from `experiential-byok` `jev-latest` (763, same input-token counts as
  Jev on every run) and, since 2026-10-13, `hal-x` `THX-01` (717, 1.25×
  Jev's input tokens, so a different model). All 1480 were rejected and
  re-asked of Jev. The router failed in the same runs as Jev (177 router
  and 174 Jev failures in 25 runs), so it never covered for Jev. Turn it
  back on only after the bench (`decision` step with
  `--models anyrouter/decision`) shows it serving Jev.
- TypeSafe Jev (`typesafe/jev`) judges the items the router missed:
  relevance is P(AI/tech), importance is the probability-weighted level on
  a 1–10 scale anchored by the shared bands in `worker/importance-rubric.ts`
  (the chat rubric uses the same bands), quality is a 0–9 score level,
  category is one choice from the fixed 10-value enum (legal stories use
  Regulation), plus one entity tag and one theme tag from fixed 10-value
  enums (`none` is dropped).
- Neither System One hop emits a free-form tag list.
- Categories: chat picks one of 14 — ten core (Models, Regulation,
  Products, Agents, Research, Industry, Infra, Releases, Chips, Funding)
  and four builder categories for AI and data engineers (Tools,
  Frameworks, Data, Open Source). One-line definitions and the tie-break
  rule live in `CATEGORY_DEFINITIONS` and `CATEGORY_RULE`
  (`worker/llm.ts`) and feed both scorers: a model of any license is
  Models; anything for developers is Tools; a library or SDK is
  Frameworks; Products is end-user apps; Open Source is an open code
  release where openness is the news; Releases is the last resort.
- TypeSafe rejects more than ten options per question, so Jev asks two
  choice questions: `category` (the ten core) and `builder` (none + the
  four builder categories). A non-none builder answer overrides the core
  pick and adds its theme tag (devtools, framework, data-engineering,
  open-source). Old rows keep their category; no backfill.
- Any item both hops miss (no key, non-2xx, timeout, non-Jev upstream, or
  incomplete answers) falls through to the chat rubric on the same fields,
  which still writes 3–6 free-form `tags`.
- Do not put `typesafe/jev` or `anyrouter/decision` on `ANYROUTER_MODEL`:
  chat completions reject Jev and route the decision router to an entity
  extractor.
- **Hide rule:** `relevance < 0.4` → status `rejected` (never shown).
  A row written unscored (its `score-N` batch failed, so it was stored at
  relevance 0.5) gets the same rule when `backfill-score` scores it later:
  a published row under 0.4 becomes `rejected`.
- **Optional JEV review panel** (`worker/jev-panel/`), off unless
  `JEV_PANEL_ENABLED` is truthy. When on, two judges from different vendor
  families (`JEV_PANEL_RELEVANCE_MODEL`, `JEV_PANEL_SOURCE_QUALITY_MODEL`)
  review each scored row with an explicit quorum (`JEV_PANEL_QUORUM`,
  default 2) and at most one debate round. The panel can only lower
  relevance: `support` → `min(primary, panel mean)`, `oppose` → `0`,
  no decision → primary (or `0` with `JEV_PANEL_FAIL_MODE=closed`). Same
  model or same family for both roles is refused before any call; a bad
  config always keeps the primary score. Results are memoized per run id +
  item id, so a replayed step does not re-vote. An optional third judge
  (`JEV_PANEL_SAFETY_MODEL`) joins when set. Each non-replayed run writes
  an audit row to `jev_panel_verdicts` (admin `GET /api/admin/jev-verdicts`,
  human override at `POST /api/admin/jev-verdicts/<id>/override`, also in
  the admin panel). An `overturn` restores the pre-panel `llm_relevance`
  if the item still holds the panel's value. Judges run concurrently
  under the item budget. At most 10 items per scoring step go to the
  panel (`JEV_PANEL_MAX_ITEMS_PER_STEP`), in input order; the rest keep
  the primary score. Details: `worker/jev-panel/README.md`.
- Tags are then canonicalized (`normalizeTopics`) and captured into
  `topic_daily` each ingest (~15 min). One mapping call asks about at
  most 100 unseen tags (`MAX_UNSEEN_TOPICS_IN_PROMPT`); tags past that
  become their own canonical, the same as after a failed call.
- **Fallback tags (#770).** Jev answers `none` for both entity and theme on
  about 9% of stories (Airbnb, Samsung, Vietnamese public-sector news),
  which used to publish with `tags = []` and drop out of `?tag=` pages and
  trending chips. `normalizeTopics` gives a story with no scorer tags
  `fallbackTags` (`worker/tag-fallback.ts`), so ingest, `backfill-score`
  and reprocess all apply it. It calls no model. It reads the `topics`
  rows normalize already loads and returns only names that are their own
  canonical, so the mapping call never sees them. The rules, in order:
  - headline names on a fixed entity list (labs, companies, products, a
    few people and countries), matched on capitalised ASCII words with the
    longest name first, so Vietnamese words never match;
  - six explicit aliases (iPhone → `apple`, Starship → `spacex`, AWS →
    `amazon`, …). `topics` alias rows are not used, because some are
    wrong for a headline (`autonomous-vehicles` → `waymo`);
  - English and Vietnamese theme keywords (`chips`, `robotics`,
    `data-center`, `smartphone`, `vietnam`, `innovation`, …);
  - `research` for arXiv and HF papers.

  At most 3 tags, entities first, because the card topic is `tags[0]`.
  A story it names nothing for stays `[]`. Fallback tags count in `topics`
  and reach `topic_daily` through learn-topics like scorer tags. Its
  entities can then become learned keywords and trending chips, as scorer
  entities can. Its themes cannot: each is on `LEARNING_THEME_DENYLIST`
  (`healthcare`, `education`, `smartphone`, `innovation` and `economy`
  were added for it), except `vietnam`, which is a country. When the
  normalize-topics step itself fails, a story keeps the scorer's tags
  (#773), and a story with none gets `fallbackTags` from a fresh read of
  `topics`. It stores `[]` only when that read also fails, or the fallback
  names nothing.
  Measured on production, 2026-10-15:
  - it tags 115 of the 233 untagged published stories;
  - on a random 40 of them, 52 of 55 tags were right, 54 counting a
    company the headline names only as a rival;
  - on 1,438 chat-rubric rows, 88% of its tags were already among the
    row's 3-6 tags.

  Keyword rules for `security`, `energy`, `stock-market` and `research`,
  and generic topic words (`model`, `cloud`, `memory`), were dropped as
  too often wrong.

  Measured again on 2026-10-16, over the week of published stories to
  that date (847 rows; the chat rubric answered 7 score batches that
  week, Jev the rest):
  - 5 of the 186 stories published after the fallback shipped have no
    tags (2.7%), against 37 of 661 before it (5.6%, 5.7% over the same
    sources). Jev still answers none/none for an inferred 14 to 23 of the
    186: 18 carry exactly the fallback's tags, 9 of them a tag outside
    Jev's vocabulary.
  - The untagged rows are essays with no named company ("Men Can't Stop
    Faking How Much They Know About AI"), TechCrunch Disrupt promos, and
    companies `topics` has no canonical for (Yandex, Dyson, Deezer,
    Omron). The fallback only returns existing canonicals, so it cannot
    name a company seen for the first time.
  - `uk` and `ukraine` joined the entity list then. In all 35 published
    headlines naming UK or Ukraine, the country is where the story happens
    or who acts in it. `world-labs` was left out: one of four headlines
    naming it was "Real World Labs", and a wrong tag is worse than none.
- Emerging entity/model names that clear a frequency/growth bar promote
  into `learned_keywords` for title highlight and growth-boosted
  homepage trending chips (`worker/topic-learning.ts`). Nothing retires a
  row: `status` only ever becomes `active`. The denylist is therefore also
  applied when keywords are read (`readableLearnedKeywords`): a row learned
  before its theme was denylisted ("Data Center", "Innovation") stays in D1
  but is not highlighted, and returns if the theme leaves the list.
- Homepage trending prefers versioned model/product names extracted
  from headlines (e.g. GPT-6 Astra, Fable 5.1) over generic themes like
  `llm` / `agent`. Headline extraction (`extractTitleEntities`) uses
  general rules, not only a family list: a capitalised name plus a
  version, mixed-case coined names (LangSmith, ChatGPT), a leading
  `Name:` and a short name after a launch verb. The generic version rule
  is skipped on Vietnamese headlines; business themes (stock sales,
  earnings, industry news) are denylisted.
  Extraction also names builder frameworks and platforms without a
  version (Workers AI, Agents SDK, Llama Stack, Pydantic AI, Mastra, DSPy)
  and the model name inside Workers AI ids (`@cf/<org>/<model>`).
- Chip weight is source-count (capped at 8) so a merged multi-outlet
  story outranks a single-source mention of the same name.
- Chips are ordered: models/products mentioned at least twice, then
  single mentions, then labs only as filler up to 8. A name counts as a
  model/product when a headline produced it or it carries a version;
  a hyphenated LLM tag alone (`daily-active-users`) does not.
- `pnpm --filter @aidr/web bench` (`scripts/quality-bench.ts`) scores
  trending, entity extraction, the keyword prefilter, source diversity
  and importance against frozen hand-labelled gold sets in
  `scripts/fixtures/quality-bench/`; keep a change only if it does not
  lower the composite.

### 5. Merge (LLM + title similarity)

One clustering call, plus a
deterministic pass.

- The clustering call compares new items (title, url, source) with the
  last 72h of published titles. It sees at most 100 new items
  (`MAX_NEW_ITEMS_IN_CLUSTER_PROMPT`, input order) and 300 published
  ones; new items past that are left to the title pass below.
- A deterministic title-similarity pass (`isTitleNearDuplicate`) runs
  alongside so same-story URLs the model misses still collapse. It merges
  equal normalized headlines, and headlines with high token overlap
  (3+ shared words at half overlap, or 2+ when the shorter one is 72%
  inside the longer) that also share one evidence token (the gate's
  tokens below). The evidence check can be skipped only when every word of
  a 3+ word headline is in the other ("'AI' is Not a Tool" in "'AI' Is
  Not a Tool by Rich Hickey"). Before #749 overlap on common words alone
  ("Show HN", "AI", "agent", "System One Model") and on Vietnamese
  fragments merged unrelated stories: normalization turned each diacritic
  into a space ("triệu" -> "trie u"); it now folds whole words
  ("trieu").
- The same pass merges two URLs of one publisher article whatever their
  headlines (`articleId`). vnexpress ends each URL in the article's
  numeric id and keeps it when it edits a headline under a new slug, or
  serves the event's live page (`-tong-thuat`): `586b7f43` "Thủ tướng:
  Nhiệm vụ khoa học công nghệ phải trả lời 4 câu hỏi" is `7afadede` "Thủ
  tướng: Phải đo đếm đóng góp của công nghệ vào tăng trưởng" under a new
  headline, and shares too few words for the title rule. Replayed over
  the 3,245 merges of 2026-08-15 to 10-14 the pass now splits 27 the old
  rule allowed (the 11 #749 pairs, 15 more different stories, and one
  pair of different articles on liability for rogue AI agents) and merges
  none it did not. Over 1.14M published pairs within 72h it flags 176 instead of
  185; the 9 dropped pairs are all different stories.
- Cluster gate (`worker/cluster-gate.ts`, #733): an existing id stays in
  a model cluster only when one of the cluster's new items shares
  evidence with it: a headline that names an org the other item is the
  official source of ("Google DeepMind …" against a deepmind post, also
  through an HN link's URL), or the item's title against the story's
  title or its stored translation (`translations.title` in the other
  language, read with the candidates): a near-duplicate (the title pass
  merges those anyway), or a shared evidence token. Tokens (#745): words
  of 3+ letters minus `COMMON_WORDS` (function words, and headline verbs
  and AI nouns such as "agent", "model", "launch", "data"); numbers of
  100+ that are not years; numbers with a unit ("13b", "b300"). In a
  Vietnamese title, diacritics fold per whole syllable ("triệu" ->
  "trieu"), a word with no diacritics that is not
  a Vietnamese syllable ("Google", "Gemini", "robot") counts alone as a
  name, and other syllables count as adjacent pairs ("thiet ke"), minus
  function syllables and common pairs ("mo hinh", "du lieu", "viet
  nam"). Company names stay evidence: dropping them blocked two correct
  #728 merges that share only "OpenAI". When some new items are in the
  story's language only those are judged. The rest of the cluster is
  kept, so correctly paired twins still fold together; a cluster with no
  new item is dropped. The Laguna era attached paired
  huggingnews/marketbrief twins to unrelated published stories. On the
  #728 hand labels (`scripts/cluster-gate-eval.ts`) the gate blocks 70 of
  86 wrong pairs (46 of 56 wrong canonicals fully) and 0 of 17 correct
  low-overlap pairs. Of the 136 links only the model made into existing
  stories from 2026-09-30 to 10-14 (431 links in all; the title and
  official passes made the rest) it blocks 27: 25 clearly different
  stories, 1 labelled unclear (`af4c8dc5`) and 1 judged different on
  review (`a7af6f12`, US and UK regulators vs the AI Safety Institute).
  Two random published titles pass 3.9% of the time in English (9.1%
  before #745), 2.9% in Vietnamese (28.1%) and 2.3-2.9% across languages
  (every pair before); on the half of titles the word lists were not
  drawn from, 4.8% (10.0%), 4.1% (21.5%, 38 Vietnamese titles) and
  2.9-3.4%. Misses are same-company stories that
  share the company name. Each rejection logs `cluster gate: <model>
  linked …` and counts in `stats.clusterGate` (per served model: links
  proposed, links rejected).
- The prompt names new items by index and existing rows by an alias in the
  order sent: `E`, the position padded to 3 digits and a Damm check digit
  (row 17 is `E0174`; `worker/cluster-alias.ts`). The parser maps each alias
  back to its row id with an exact lookup. Anything that is not exactly a
  sent alias is dropped, so a mistyped reference reads as no duplicate.
  With full 64-hex ids the model lost 22 of 66 links to existing stories
  (22 runs on `google/gemma-latest`, 2026-10-16). Every one-digit slip and
  every swap of two adjacent digits (`E0714` for `E0174`) spells no sent
  alias, and the fixed width means a dropped or added digit does not
  either (unpadded, `E174` minus its last digit was row 1's `E17`). Each
  is dropped and counted in `existingNearMiss`, never linked (#817).
  Residual risk: a model that names the wrong row with a valid alias. That
  is a wrong link only the cluster gate stops, and only when the two
  stories share no evidence.
  `stats.clusterRefs` counts, per served model, the `new` and `existing`
  entries answered and kept, the `existing` entries that were not
  strings, those shaped like an alias once trimmed and uppercased but not
  sent as written (`existingNearMiss`: `e0013`, `E30014`, a digit
  slip; before the aliases, ids within 2 edits or an 8+ character prefix of a sent id), and the
  clusters the drops left with fewer than 2 members. Numbers only: no
  model text is stored (#752). `agent audit` prints it per run.
- The prompt merges different outlets' first-day coverage of one
  announcement whatever the headline angle, and keeps later developments
  (market reaction, failed demo, wider rollout, a later benchmark)
  separate, with real Gemini 4 examples. Feed titles are fenced as
  untrusted data.
- A third, deterministic pass merges an official post with aggregator
  rewrites of it (`clusterOfficialRewrites`). A source is official when
  its catalog row lists `official` orgs (vendor newsrooms such as
  `cloudflare-blog`, `openai`, `deepmind`), or when an item's URL host is
  such a source's homepage or feed host (an HN link to the post, a
  reader's submission). It merges a pair only when:
  - the other item is from the aggregator family and was published
    within 36h;
  - its headline uses a launch verb and names one of the official orgs
    plus the product the official headline leads with
    ("Introducing Clef: …" → "clef");
  - neither headline carries a follow-up word (stocks, rollout, capacity,
    review, benchmark, analysis, lawsuit, outage, leak, halt, cancel,
    recap).
- Canonical: an official existing item stays canonical. Otherwise an
  official new item that passes relevance and is a rewrite match (rule
  above) for the would-be canonical takes over the cluster. Otherwise the
  existing item wins, else the highest rank. A takeover demotes the old
  canonical (`MergePlan.demoted`): it and everything merged into it point
  at the official item, its sources, topics and reader engagement fold in,
  and sent notifications move to the new id so nothing is posted twice. A
  merged id's permalink resolves to its canonical (`getStory`).
- Losers get status `merged` + `duplicate_of`. Their sources fold into
  the canonical, deduped by URL without tracking parameters, never
  repeating the canonical's own URL, official links first. Only reader
  engagement (see 7) folds into its points/comments (`worker/dedupe.ts`).

### 6. Translate (LLM)

EN→VI in batches, journalist style (`VI_STYLE`
system prompt: no parenthetical glosses, no calques, keep technical
jargon in English, few-shot anchored). `translatePrompt` sends each item
with a `keep` list from `worker/translation-terms.ts`, the same list the QA
guard enforces, and instructs a full sentence-by-sentence translation with
no condensing or added facts (Vietnamese summary ≥ ~80% of the source
length). `VI_STYLE` also fixes headline sentence case, exact magnitudes
(B = tỷ, M = triệu, T = nghìn tỷ; model sizes like "7B" stay), and lists
known calques as bad → good examples.
Ingest strips the "appeared first on" feed footer
(`stripSourceBoilerplate`), and `sentSource` strips it again from rows
stored before that.

Right after generation, `worker/translation-draft-check.ts` runs a
deterministic check against the exact (stripped, clipped) source the model
saw: missing keep-English jargon, active `translation_knowledge` bad phrases
(counted per occurrence, so one kept "agent" does not excuse an "đại lý";
each non-AI "FBI agents" licenses one "đặc vụ"), wrong magnitude words
("$20B" → "20 triệu"), a Title Case Vietnamese title, a summary under
0.6× the source length (sources ≥ 200 chars), and an English echo: a
summary with no Vietnamese diacritics when the source summary has ≥ 6
words (the issue names the title too when it is English as well). A title
alone is not judged, since paper titles and product names stay English on
purpose. In 60 days to 2026-10-15 this flags 4 of 4,480 rows (8eb3e0ba,
669d8cd0, 1af7ebf2, f924232d); every kept-English summary it spares is a
name of ≤ 4 words. A repair that echoes again is rejected, so the English
draft is stored (#777). It also flags a changed version: a name and number
from the source ("Gemini 3.8", "GPT-6", "VR72") written with a number the
source never uses ("Gemini 1.5", "GPT-4o"), in the title or summary, and a
dotted version in the source title ("GLM-5.3") that neither Vietnamese
field keeps. Money, percentages, multipliers and magnitudes ("$1.4T",
"19.6%", "1.9x", "70B") are not versions, and a decimal comma counts as the
same number. Over all 4,503 VI rows to 2026-10-15 this flags 5, all wrong
versions: c4c7ba8f, 45a86641, b0e46c0d, 7fa80fb0 in the title and
9f46901a ("GPT-5.6" cut to "GPT-5") in the summary (#781). A shortened
title whose summary keeps the version, an integer version dropped from a
title ("Gemini 4"), and a version dropped from a summary are not judged.
Flagged items in a batch get
one repair call with their issues as a `fix` list; a repaired row replaces
the draft only when it has fewer issues, and the repair is skipped under
25s of budget. Missing proper names are left to the review guard: they are
too noisy to spend a call on. Migration 0045 seeds the calque and
institution rules (open-weight, decision model, harness, hyperscaler;
Senate = Thượng viện, Attorney General = Tổng chưởng lý, Governor = Thống
đốc, White House = Nhà Trắng). Every item and translation row
carries explicit `source_lang`/`target_lang` metadata; the reviewer never
infers direction from Vietnamese diacritics. A Vietnamese source with an
explicit `source_lang='vi'` is a real VI→EN pair: the bounded QA runtime can
create a missing English candidate with `ANYROUTER_ENGLISH_TRANSLATE_MODEL`,
then independently reviews that candidate. The review path lives in
`worker/translation-qa.ts`:

- `ANYROUTER_REVIEW_MODEL` (legacy: explicit `ANYROUTER_QA_MODEL`) is
  required. The reviewer chain must be concrete and disjoint from every
  `ANYROUTER_TRANSLATE_MODEL` id; missing/overlapping config fails closed
  rather than self-reviewing with the generator. English generation is also
  explicit and never silently falls back.
- A falsy `TRANSLATION_REVIEW_ENABLED` pauses review and repair. The
  reviewer config is then not checked, and English candidates are still
  created. Unset means on.
- The strict `translation-semantic-v4` JSON verdict (`schema_version` 3)
  scores fidelity, naturalness, and confidence separately and carries the
  reviewer's literal `back_translation` of the candidate, written before it
  compares the source (candidate is serialized first). It costs no extra
  call and inherits the reviewer chain's disjointness; it is not a blind
  back-translation.
- For EN→VI, the English back-translation is compared with the English
  source deterministically: every source number must survive, a source
  negation or hedge must survive, and content-word recall must be ≥ 0.4
  (else `omission`).
- Deterministic entity, number, date, unit, polarity, uncertainty, and
  terminology guards can override an optimistic reviewer. Names (acronyms,
  camelCase/digit tokens such as GPT-5.6, headline names, short capitalized
  runs) and the keep-English jargon in `worker/translation-terms.ts`
  (fine-tune, agent, benchmark, token, open-weights, prompt, chatbot, …)
  must appear verbatim in the Vietnamese; a miss is
  `entities`/`terminology`. Polarity and uncertainty are one-way: a source
  negation or hedge must survive; additions are the reviewer's `addition`
  call. Feed chrome (aggregator "Back to live feed" lines, arXiv listing
  headers, "The post/article … appeared first on …" footers) is stripped
  before every guard.
- Prompt data is delimiter-escaped and output must be one exact bounded
  JSON object; prose, fences, duplicate keys, and oversized responses are
  rejected.
- Accept requires no hard failure, fidelity/naturalness ≥ 0.7, and
  confidence ≥ 0.6. An EN→VI failure gets at most one generator repair and
  one independent re-review. The repair prompt receives the missing English
  terms, the back-translation, and its divergent checks as untrusted
  metadata, and must translate the whole source. VI→EN failures are not silently substituted;
  disagreement, abstention, low confidence, malformed output, or exhausted
  budget becomes an actionable terminal `human_review` state and preserves
  the original candidate.
- `items.source_revision` plus source title/summary content CAS guards every
  attempt, review marker, and repair write. A source-language/title/summary
  write increments the revision and invalidates every candidate, including
  writers that emit no translation. Immutable `translation_review_attempts`
  rows are separate from leased `translation_review_state`; criteria, prompt,
  policy, and model fingerprints are part of idempotency. Source revision is
  part of every review uniqueness key, and a successful repair stores the
  final re-review `attempt_id` rather than the initial attempt. Claims use a
  five-minute lease (longer than the 210-second wall budget) and renew it
  with a lease-token/source CAS after each provider phase. Marker and state
  writes are committed as one guarded batch; a zero-row CAS is never
  reported as an accepted translation. Cross-run failures use exponential
  backoff and become terminal `human_review` after three automatic attempts;
  one explicit human retry is separately bounded and recorded.
- One run makes at most 6 logical reviewer/generator calls, has a 210-second
  wall budget, and allows two model attempts per logical call. Workflow
  retries remain zero. Translation and review response snippets are
  suppressed and provider errors are redacted before LLM telemetry or the
  admin API. Authenticated operators resolve the queue through
  `GET /api/admin/translation-reviews` and
  `POST /api/admin/translation-reviews/:attemptId/resolve`; actor, action,
  time, and note are persisted.
- `pnpm run verify:translation-schema` is a read-only migration gate run by
  `pnpm run deploy`. A pre-0023 database fails before pending-row queries;
  it is never reported as zero pending. Translation QA is wholly owned by
  0023; #160's media migration is 0024 and #161's run-identity migration is
  0025. Apply/verify migrations in order and never apply them from the QA
  worker.

Quality limits: `pnpm exec tsx scripts/translation-eval.ts` runs 30 real
production EN→VI pairs (`scripts/fixtures/translation-eval.json`). `guard`
mode measures the deterministic guards alone; `run` mode measures reviewer
accept rate, term preservation, and a blind back-translation instrument
(`--candidates` reuses an earlier run's candidates to isolate QA changes).
These are automated proxies, not a human-labeled quality score.

Prompt × model arms (2026-10-16, `translation-eval.ts gen | metrics | judge
| verdict`): 36 production stories in five source kinds
(`scripts/fixtures/vi-natural/items.json`, frozen 3-story batches, the
active `translation_knowledge` rows), each arm the Worker's own
`translateItems` call, two blind judges per pair (gpt-5.6-luna and
deepseek-flash; Sonnet and GLM were out of balance). A free-form card ("not
sentence by sentence", third-person voice, no length line;
`cards/natural.patch`) did not read more natural on either model and lost
more facts, so the card above is unchanged:

| Pair (both judges agree) | Natural wins | Faithful wins | Lost facts / story (luna, deepseek) |
|---|---|---|---|
| master vs free-form, Laguna | 7 vs 11 of 36 | 17 vs 4 | 1.27 vs 2.12, 1.00 vs 2.24 |
| master vs free-form, Gemma | 11 vs 10 | 8 vs 4 | 0.43 vs 1.47, 2.03 vs 2.23 |
| master + #654 voice line vs master, Laguna | 10 vs 9 | 3 vs 12 | 1.52 vs 1.30, 2.33 vs 1.18 |
| Gemma vs Laguna, master card | 27 vs 4 | 13 vs 6 | 0.63 vs 1.43, 2.87 vs 3.77 |

Lost facts exclude batches whose first call failed (titles-only
fallback). The model, not the card, decides how natural the Vietnamese
reads: gemma-latest wins 75% of stories on the master card. It stays
second in `ANYROUTER_TRANSLATE_MODEL` because its route failed the first
call on 2 of 12 batches here and served 62 of 88 production calls in the
24h before, against Laguna's 1 of 13 and 493 of 527.

### 7. Rank (pure code, `worker/ranking.ts`)

Recomputed every run for
items published in the last 72h (`RANK_RECOMPUTE_WINDOW_SEC`, rolling, not
the UTC day), in one `UPDATE … json_each(?)` statement. A day's archive
order can shift for up to 3 days, then freezes. A pre-existing canonical
that absorbs a merge gets its rank recomputed from its whole cluster in
the same write.

```text
rank_score = importance^1.5 / √10             # 10 stays 10; 7 → 5.9, 8 → 7.2
           × (0.6 + 0.4·quality/10)           # quality modulates ±40%
           × decay(age)                       # exp(−age/36h); after 24h also × exp(−(age−24h)/24h)
           × min(engagement × sourceBoost, 3.25)
           × (1 + 0.2·min(voteNet, 6))        # reader votes; net < 0: 1 / (1 + 0.2·min(−voteNet, 6))
           × breaking(age)                    # importance ≥ 8 only: 1 + 0.4·exp(−age/3h)

engagement  = 1 + log10(1 + points + 0.5·comments)   # capped at 1.3 when importance < 4
sourceBoost = 1 + 0.12·(min(sourceCount, 8) − 1)     # extra independent outlets
```

Constants live in `worker/ranking.ts` (`IMPORTANCE_EXPONENT`,
`DECAY_*`, `ENGAGEMENT_BOOST_CAP`, `LOW_IMPORTANCE_*`, `BREAKING_*`,
`READER_VOTE_GAIN`, `READER_VOTE_CAP`). Why each rule exists, from the
2026-10-11 audit and `rank-replay` (below):

- **Decay ramp and boost cap.** 5 of the top 30 were older than 36h. After
  24h the decay steepens, and `engagement × sourceBoost` stops at 3.25 so
  HN volume plus many outlets cannot hold a stale story up.
- **Importance power.** The scorer clusters on 7. The power spreads 7 from
  9–10 without moving the 10 end.
- **Low-importance engagement cap.** A minor item with a loud thread (below
  importance 4) gets at most ×1.3 from engagement.
- **Breaking boost.** A fresh importance-8+ story gets up to ×1.4 that fades
  in a few hours. `weeklyScore` uses `rankScoreWithoutBreaking`, because at
  age zero the boost would lift every 8 over every 7.
- **Votes are a separate factor, not points.** They used to count as 10 HN
  points inside the log, so one vote on a zero-point story doubled its
  engagement and put a single-vote story at #2 (Yandex outage, 2026-10-11).
  Now one vote is ×1.2, five are ×2, and the factor stops at six votes
  (×2.2), whatever the story's HN points. Replay: five votes put a fresh
  top-30 story into the top 5 in 92% of hours; one vote moves a top-10
  neighbour at most 22 places, down from 216.

A story's cluster is the canonical item plus every `merged` item whose
`duplicate_of` points at it. `rankSignals` reads it one way everywhere
(insert, merge recompute, 72h re-rank, backfill, admin rate/preview;
SQL via `RANK_SIGNAL_COLUMNS` + `RANK_SIGNAL_JOIN`):

- `sourceCount` = distinct source **families** in the cluster
  (`family` in `worker/sources/catalog.ts`, else the source id). One
  outlet gets no boost; HN + TechCrunch + Verge gets 1.24. Tweets in
  `item_sources` are display only, and the HuggingNews/MarketBrief mirror
  pair counts once. A user submission counts as the family of the
  catalog source serving its URL host (a submitted Cloudflare post and the
  Cloudflare feed count once).
- `points`/`comments` = the highest values among cluster items whose
  source has `engagement: "reader"` (HN, Lobsters). Aggregator
  author/tweet counts are stored for display but never ranked.
- `voteNet` = `SUM(value)` from `item_votes` on that item (one row per
  signed-in user, `+1` or `-1`; clearing deletes the row). `voteFactor`
  turns it into the multiplier above: ×1.2 per net vote up to six, and
  the inverse for a net downvote, so downvotes lower the score without
  ever zeroing it. A vote re-ranks its item at once (`applyVote`). The
  30-minute re-rank reads the sum through `RANK_SIGNAL_JOIN`. Trending still uses
  `rank_score` only. A vote does not change digest or email selection
  except by moving that score.

**Reader reads: homepage order within a day only.** `item_reads`
(migration 0065) counts story opens and publisher clicks per story, UTC
day, arrival channel and kind (`POST /api/read`, `worker/reads.ts`). Only
the homepage asks for read order: its SSR loader (`feed-fn.ts`) and its own
`/api/feed?order=reads` calls (refresh, Load more, Older days). The SSR
loader also asks `getFeed` for collapsed rows (`detail: false`): the item
SELECT carries no summaries, no `item_sources` statement runs, and SQL computes
`has_detail` (becomes `lazyDetail`, so the row refetches `/api/story` on
first expand) and `source_count` (the trending weight). `/api/feed`, RSS,
the news sitemap and the MCP tools keep the full shape. Every `getFeed`
read is one D1 batch (items, categories, TL;DR, freshness, older-days
probe, learned keywords, yesterday's topic counts, and for the full shape
the `item_sources` rows selected off the same item query): a Worker far
from the ENAM primary pays about 300ms per round trip, so nothing waits on
an earlier statement's result, and the read path never issues DDL or any
other write (`src/lib/feed-queries.roundtrips.test.ts`). No schema probe
runs before that batch, even on a cold isolate. The deploy gate
(`check:migrations`, `worker/migration-gate.ts`) refuses to upload a Worker
while any migration is missing from the D1 ledger, so feed, story, day and
weekly reads select `llm_tokens`, `image_url`, `media_manifest`, the
`item_votes` join and the `item_reads` join directly. For those,
`getFeed`'s `readOrder` sorts each day by:

```text
homepage in-day order = rank_score × (1 + 0.15·opens / (opens + 800))
opens = story opens (never outbound clicks) today and yesterday UTC,
        each UTC day capped at 100 per story; opens on an id later
        merged count for its canonical, inside that canonical's cap
```

The most any story gets is ×1.03 (200 counted opens). Nothing else sees
reads. Every row keeps its stored `rank_score`, and without `readOrder`
`getFeed` does not join `item_reads` at all, so the per-source cap
(`capSourceShare`), the homepage TL;DR fallback, `/api/feed` membership and
its `rank_score` field, plain `/api/feed` order (the extension, webmcp),
RSS, the news sitemap, MCP `search_news`, the day archive and its Telegram
day card, the edition pool (`tldr.ts`), Telegram trending, Facebook, email
and the weekly roundup ignore them. A read is anonymous and a script can
fake one, so it must never add a story to, or drop one from, a day, a feed,
RSS, the API, the archive or a post. It can only move a story a few places
inside its day, and so across the homepage's 30-story first view (from #33
at most on the day simulated below).
`worker/__tests__/feed-reads.integration.test.ts` holds a test per surface.
Collection:

- The browser counts a story once per tab, kind and UTC day with a key in
  `sessionStorage`. That is client-side only; the server cannot enforce it.
- The server drops bot user agents, `Sec-Fetch-Site: cross-site`, unknown
  or unpublished ids and malformed bodies. User agent and fetch-site are
  spoofable, so they only stop honest crawlers and other sites' pages.
- `READ_LIMITER` (`[[ratelimits]]`, limit 1, period 60) counts one beacon
  per (IP, story, kind) a minute. aidr stores nothing; Cloudflare keeps the
  counter at that location, eventually consistent, so a parallel burst
  can slip a few extra through. 60 seconds is the longest period the
  binding offers, so one IP dripping a beacon a minute still counts 1440
  opens a day. If the limiter throws, the beacon counts nothing. Each
  stored row stops at 2000 (`READ_ROW_CAP`); that only bounds `/data`.
- One IP can reach the day cap, and any number of IPs get no more, so the
  cap sets the worst case, not the curve. Simulated on the 15 Oct 2026 ICT
  production day (159 stories; the homepage first view is the top 30):

  | Counted opens | Factor | Max climb | Deepest entrant into top 30 |
  |---|---|---|---|
  | 200: one IP, 1/min for 24h across UTC midnight | ×1.030 | 10 (#62 to #53) | #33 |
  | 100: the same drip inside one UTC day | ×1.017 | 6 | #31 |
  | 50: 50 readers, one open each | ×1.009 | 4 | #31 |
  | 10: 10 readers | ×1.002 | 2 | none |

  The previous ×1.3 / 200 curve with clicks counted let the 24h drip lift
  #62 to #30.
- Bound: reads never lift a story past one whose stored rank is 1.03× its
  own. All other factors equal, that is an importance ratio of 1.02 (a 7.0
  never passes a 7.2).

Known gaps: the constants are not replay-tuned with `rank-replay`. Below
the cap the order cannot tell a one-IP drip from genuine readers (an hour
of drip is 60 opens, about 60 readers). Above 100 opens a day genuine
popularity stops separating stories. After in-site navigation the channel
falls back to `web`; readers sharing one IP (carrier NAT, an office) count
at most once a minute per story and kind. Category totals over 28 days
show on `/data` (Algo tab, `GET /api/system/reads`). The same response
carries `top_stories`, the top 5 published stories per channel by opens over
7 days with their outbound clicks (`TOP_STORIES_*` in `reads-query.ts`).
Reads on a merged id fold into the canonical. A story is not listed in a
channel under that channel's minimum opens: 3 by default, 10 for `email`,
`telegram` and `extension` (`TOP_STORIES_MIN_OPENS_BY_CHANNEL`). `count` is
hits, not readers, and those channels have few readers, so 3 opens could be
one reader. Facebook, YouTube, RSS and `other` keep 3 because they are
broadcast surfaces with no known small audience.

### 8. Write

D1 upserts (`worker/d1-bind.ts` guards every bind). D1 is
the sole primary store. Migration `0024_item_media_manifest.sql` adds the
bounded JSON manifest; `image_url` remains the compatibility field.

### 9. Backfill

Up to 15 older published items missing summary or
score/tags, and up to 45 missing Vietnamese titles, get
re-fetched/scored/translated per run until the backlog drains.
The media part takes up to 15 published rows whose manifest is still the
0024 column default (`'[]'`, `UNCHECKED_MEDIA_SQL`), newest first. Every
fetch stores a versioned manifest, even an empty one when the page refused
the bot (openai.com 403, reuters.com 401) or offered only a logo, so each row
is fetched once and the queue moves on. A row ingest stored with a manifest
is not selected; ingest's enrich had its one fetch, except items past that
run's 20-fetch cap (`MAX_ENRICH_FETCHES`), which are never fetched.
The summary part (`buildMissingSummaryQuery`) takes up to 15 published rows
whose summary is empty or reads as cut off (`…`, `[…]`, "Read more"),
newest first, and only rows with `items.summary_checked_at` still NULL
(migration 0066). Each fetch sets that column, guarded on the column still
being NULL and the summary unchanged since the read, so a row is fetched
once whatever came back: a page that refuses the bot (reuters.com 401,
ft.com 403) and a teaser the page never improves (a techmeme permalink gives
only the og:image already stored) both leave the queue. There is no retry.
A summary another writer stores during the fetch keeps the row queued for
one fetch of its own. `planBackfillUpdate` returns null when the write would
store what the row holds, so nothing is written or counted. Translation QA
is cleared only when the summary changed, not for a new picture. Until 0066
is applied the query falls back to the old predicate and logs a warning;
the summary head is then refetched every run, as before #811.
Translate skips LLM only when explicit `source_lang='vi'` metadata marks a
native source, retries leftover items one-at-a-time after a batch fail, and
the VI UI hides the EN badge when the painted title is Vietnamese or
`title_vi` exists.

**English summary (`backfill-en-summary`, LLM).** `items.summary` is the
upstream text as fetched (RSS teaser, og:description) and stays raw: dedupe,
scoring, translation, QA and the TL;DR input read it. Readers see
`items.summary_en` (migration 0055), one fluent, neutral English summary of
at most 2–4 sentences written by `summarizeEnglish` (task `summarize`,
`ANYROUTER_TRANSLATE_MODEL` chain, 4 stories per call) from the same
stripped, clipped source the Vietnamese translator sees (`sentSource`), so
both languages carry the same facts. `worker/en-summary.ts` rejects output
with `[…]`, "Read more", a trailing ellipsis, links, counters, an unfinished
sentence, or a number the source lacks; a rejected row keeps the raw text
and is retried next run. `summary_en_revision` stores the
`items.source_revision` it was written from; the 0023 trigger bumps that on
any title/summary change (re-ingest, backfill-content replacing a teaser,
admin push), so a stale rewrite stops showing and the row is queued again.
The write is guarded on that revision. The step runs after
backfill-content and before tldr/email/notify, so fresh stories ship with
it; it takes up to 24 English-source published rows per run, newest first.
Vietnamese-source rows get English from the VI→EN translation path instead.
Reader-facing queries (feed, story dialog and Markdown, mail content,
notify incl. Telegram and `facebook-en`) select `enSummarySql()`:
`summary_en` when current, else raw `summary`. This is an English-only
fallback; the Vietnamese column never reads `summary_en`. Drain on demand
(a dry run still writes D1, sends nothing):
`pnpm --filter @aidr/web agent run --steps backfill-en-summary --force --wait`.

### 10. TL;DR (LLM)

Every run (30 minutes).

- Generate today's **local** snapshot (`Asia/Ho_Chi_Minh` date key —
  same identity the Telegram digest looks up for once-per-local-day
  send) if missing, thin, EN-only (`bullets_vi` empty), or
  **English-only `bullets_vi` while `title_vi` now exists**.
- Otherwise refresh a useful bilingual snapshot when the last write is
  older than 3 hours.
- Content is always the top 16 items of the **rolling last 24h** by
  rank (not ICT calendar-day-so-far), after `selectEdition`
  (`worker/digest/select.ts`) → up to 16 EN bullets + 16
  independently-restated VI bullets, each linked to its `item_id`.
- `selectEdition` is the top-list family cap (5 of 16 per family) with
  importance deciding what the cap may cut. It reorders only the top 32
  rows (`CONTENTION_DEPTH` × 16); deeper rows lost on rank (age, quality),
  not on the cap (on 2026-10-14 an 8.5 sat at #110, a day old). Over the
  rank-ordered pool, each step taking only what the earlier ones left:
  1. The top 32, importance ≥ 5, in rank order, 5 per family. An
     importance-8+ row the cap would cut takes a 6th slot for its family
     (`EDITION_TOP_TIER_LIFT` = 1). Slots for the 8+ rows are held back
     before the walk, so each comes off the edition's lowest-ranked other
     story of any family (an 8+ row can push out its own family's tail
     pick when that is the lowest), and a lifted 6th slot never costs its
     family a higher-ranked pick. A held slot
     its 8+ row could not use (the family reached 6 first) goes to the
     next importance-5+ row in the top 32.
  2. The rest of the pool in rank order, 5 per family.
  3. Anything left, in rank order, so the edition is never short.
  So a story under importance 5 makes the edition only when the top 32 has
  nothing stronger within the cap, and one family holds at most 6 of 16
  unless the pool has too few other families to fill the edition (step 3,
  as `pickDiverse` backfills). An 8+ row in the top 32 is cut only when its
  family already holds 6 higher-ranked picks (or the top 32 hold more than
  16 of them).
  Why, measured on the editions of 2026-10-09 to 10-16 (replay on the
  current `rank_score`, SELECT only): the marketbrief/huggingnews pair
  carries 37% of published stories and most model-release headlines, and
  held 5 of 16 on 6 of the 8 days; `pickDiverse` then filled the tail with
  importance-4 HN rows (a $15M maths grant at #14, a Nikon contest
  disqualification) while importance-8 rows were cut (Gemini 4 Argon's
  safety report at #26 on 10-15). The replay removes every sub-5 pick
  (6 → 0 over 8 days) and adds two 8+ stories (Broadcom's $42B loan to
  Anthropic on 10-13, the Argon report on 10-15). Every swap replaces a
  sub-5 story. The aggregator family reaches 6 of 16 once (10-15). The
  same day keeps Black Forest Labs' open 5.6B image model (#10, 7.9): an
  earlier draft let 8+ rows claim family slots first, and the Argon report
  cost it its place.
- Homepage thumbs and the story dialog need those ids. If the model
  pastes `[hex]` into the bullet text instead of (or besides)
  `item_ids`, parse recovers the ids and strips the citation.
- Each bullet is a short digest (~2 sentences / 180–240 characters),
  not a headline and not a paragraph. The homepage clamps overflow to
  2 lines and sizes the thumbnail to that row.
- `generateTldr` checks each `bullets_vi` entry against its cited items
  (`tldrBulletIssues`: knowledge-rule calques and wrong magnitude words)
  and sends the flagged bullets through one short repair call on the
  translate chain when ≥ 30s of the TL;DR budget is left. A fixed bullet
  is kept only when it has fewer issues; any failure keeps the originals.
- If the LLM returns no bullets or a thin digest (fewer than
  min(8, item count), at least 2 when there are 2+ stories), a
  title-fallback snapshot is persisted (EN from item titles; VI from
  `title_vi` or the English title if no translation — never invented
  prose), with `fallback = 1` (0061).
- A refresh that degrades to that title fallback never replaces a useful
  model digest already stored for the date: `fallback = 0`, and not thin,
  EN-only or English in VI (those refresh every run, so keeping them would
  retry every run). The model digest stays, only `created_at` moves, so the
  retry waits 3 hours as it would after storing headlines. The step
  records action `kept`, reason `kept model digest: LLM thin (<error>)`,
  which the system page shows as degraded. Rows
  from before 0061 have `fallback` NULL and are replaced. Only ingest and
  admin regenerate write the bullets, so `fallback` describes what they stored.
  From 2026-10-07 to 10-14, 4 of 6 title-fallback writes replaced a model
  digest; on 10-09 the email, both Telegram channels and Facebook sent the
  headlines.
- If the LLM digest is useful in count but `bullets_vi` has no
  Vietnamese diacritics and `title_vi` exists, keep the EN bullets and
  replace VI with the `title_vi` fallback — never persist raw English
  titles as `bullets_vi` once translations exist.
- Empty results are never persisted.
- The homepage also synthesizes a last-24h title-fallback at read time
  when the stored snapshot is thin *or* English-only in VI while
  `title_vi` exists. It only displays it and never writes
  `tldr_snapshots`; ingest owns the row and repairs it under the rules
  above. Before 2026-10-14 it persisted the rebuild, which rewrote the
  row on every view when the rebuild matched the stored bullets, marked a
  model EN digest `fallback = 1`, and stored a rebuild of an earlier
  day's snapshot under today's date.
- UI shows 8 by default (user preference 8/12/16).

### 10b. Weekly edition (LLM)

`worker/weekly.ts`, step `weekly` (after `tldr`), table `weekly_snapshots`
(0056). Pure week rules: `src/lib/week.ts`.

- **Key.** The ISO week (`YYYY-Www`, Monday..Sunday) of audience-zone dates:
  the same seven days as the `tldr_snapshots` rows and `/date/` pages. The
  first run after Monday 00:00 ICT builds the week that just closed.
  `issue` counts weeks from `WEEKLY_FIRST_WEEK` (2026-W40 = issue 1), never
  from a row count.
- **Gate (cheap).** One `SELECT` over the last 4 closed weeks
  (`WEEKLY_BACKFILL_WEEKS`, from the first issue on); the oldest week that
  needs work is built, at most one per run, so a late deploy or a failed
  Monday never skips an issue. Per week: no row → build; a complete row (LLM
  copy, `intro_vi` and `stories_vi` set) → skip; a `fallback` or
  English-only row → retry at most every 6h (`WEEKLY_RETRY_MS`). A week
  with no stories makes no LLM call and the next week is tried. A retry
  whose LLM fails never overwrites a real edition with title lines; it only
  bumps `updated_at`, so the next retry waits another 6h.
- **Candidates.** Every published story a daily edition of that week cited
  (merged duplicates mapped to `duplicate_of`), plus the week's top 60
  uncited stories by `llm_importance`.
- **Rank.** Not stored `rank_score`: it decays 36h and freezes at 72h, so a
  Monday build would favour the weekend. `weeklyScore` is
  `rankScoreWithoutBreaking` at age zero (importance, quality, reader
  points/comments via `rowRankSignals` — an aggregator's author/tweet counts
  never count, as in §7 — and net votes), × (1 + 0.25 per day in a daily edition, max 3), × 1.15 for a
  top-3 spot. Then `pickDiverse` caps source families; top 10.
- **Copy.** One bilingual call on the TL;DR chain (`ANYROUTER_TLDR_MODEL`,
  VI house style + glossary): `intro_en`/`intro_vi` (2–3 sentences) and one
  sentence per story per language. A VI line without diacritics is dropped.
  Up to two passes over the chain inside one 200s budget (a second pass
  needs 30s left), with a 35s first-token cap (`TRANSLATE_FIRST_TOKEN_MS`).
  An exhausted chain (`isProviderFailure`) is a warn, not an error: the
  title fallback is stored with a reason that has no failure words, so
  `health.ts` raises no `step-failed`; the gate retries it in 6h. Any other
  error is logged as an error and does raise `step-failed`.
- **Languages never fall back.** EN falls back to the item title. VI falls
  back to `title_vi` only; a story with neither has no VI line and is left
  out of the VI page. No model copy at all → title lines with `fallback = 1`.
  Nothing is persisted without at least one EN story.
- **Surfaces.** `/week/YYYY-Www` (newspaper layout; 404 for a malformed,
  pre-launch or open week and for a language with no stories), `/weeks`
  index, `/week/YYYY-Www.md`, and language-neutral JSON
  `GET /api/week/YYYY-Www` (both languages in separate fields; read by the
  weekly video, `videos/daily-news/scripts/fetch-week.mjs`). Day pages link
  to their week only when its row exists. Cache: explicit `?lang=` is
  public, the newest week caches 5 minutes, older weeks a day.
- **No delivery yet.** The weekly edition is not emailed, posted to
  Telegram or Facebook; it is a page (and a video script, rendered by hand).

### 10c. Rolling weekly digest (LLM)

`worker/weekly-digest.ts`, table `weekly_digests` (0060), one row per
`end_date`. Weekly email subscribers pick a weekday (§11); the mail on
local date D covers D-7..D-1. Built in the ingest `weekly` step after the
ISO-week edition, only when that step made no LLM call this run (one call
per run at most), for the window ending yesterday in the audience zone, and
only when a confirmed weekly subscriber has today's weekday. A window that
ends on a Sunday is the §10b edition and is never rebuilt here. Candidates,
ranking and copy are the §10b machinery over the date range
(`loadRangeCandidates`, `rankWeeklyCandidates`, `generateWeeklyCopy`,
`composeWeeklyLines`): cited stories plus the window's strongest uncited
ones, `weeklyScore`, `pickDiverse`, top 10, one bilingual LLM call. A
title-only fallback is retried after `WEEKLY_RETRY_MS` and never replaces
real copy. Subscribers east of the audience zone reach D first and get the
mail once the audience day turns and the row exists.

### 11. Email digest

Per-subscriber language and digest size (3/5/10
stories, default 5) to confirmed subscribers, once per their local
morning (from 07:00 in the subscriber's timezone). Copy comes from the
same edition as Telegram (`worker/digest/edition.ts`): `bullets_vi` or
`bullets_en` for that local date, with no cross-language fallback and
no fallback to another date: until the local-date row exists the
subscriber gets nothing, and the next 30-minute run sends it. An
empty column leaves `last_sent_date` unset so the next run
retries. Idempotency stays on `subscribers.last_sent_date`, not the
`notifications` table.

The mail itself (`worker/mail/render.ts`, one function per block): the
subject leads with the top one or two headlines plus "+N more" (about 60
characters, localized), with a written preheader. The header has the
wordmark, the spelled-out date, "N stories · M min read" and a link to the
other language's day page. Then the lead story (large image that is never a
generated OG card, category · source, headline, summary), then the video
card, then compact rows (number, category · source, linked headline, one
sentence, 84px thumbnail hidden on phones). The row sentence is the first
one that does not restate the headline, checked in both directions so a
long headline cannot let its own sentence through. The video is the newest
`day_videos` row in that language dated the edition date or the day before
(`youtube_id` then `short_id`, no fallback across languages). Videos go up
around 17:00 ICT, after the morning send, so most mails carry yesterday's.
The card says "Today's video brief" or "Yesterday's video brief" with the
video's date and a 16:9 `mqdefault` thumbnail; the preheader says the same.
An older video, or none, leaves the card out. After the rows: one "See
all" button, the channel strip (Telegram, YouTube, Chrome extension) and the footer (view in
browser, settings, unsubscribe, how we rank, "Forwarded this?", and
`MAIL_POSTAL_ADDRESS` when set). The headline is `items.title` or
`title_vi` for that language only; without it, the bullet's first sentence.
Every aidr.today link carries `utm_source=email`, `utm_medium=digest`,
`utm_campaign=digest-YYYY-MM-DD` (`weekly-YYYY-Www` for the weekly) and
`utm_content` for its position (`lead`, `s2`…, `cta`, `video`, `channel-*`).
Settings, unsubscribe and feedback links carry a token and stay untagged. The
shared tagger is `worker/utm.ts`; Telegram and Facebook use it too (see
`docs/analytics-events.md`). After the button, a "Was today's edition useful?" row links to `GET /feedback?d=&l=&v=1|0&t=<token>`. That stores one vote per subscriber and date in `email_feedback` (0054); the last click wins. Counts are at `GET /api/admin/mail/feedback` and in `aidr-agent audit`. Layouts: `design` (lead image plus thumbnails),
`large` (an image per story), `no-images`, `text`. Admin preview:
`GET /api/admin/mail/preview?date=&lang=&format=`.

**Delivery counts.** `mail_daily_stats(date, lang, sent, failed,
unsubscribed)` (0067, one row per UTC day and language, no address or
per-subscriber row, no tracking pixel) is written by `recordMailStat`
(`worker/mail/stats.ts`) as an UPSERT. `sent` is counted only when the
stamp moves: the lane runs `UPDATE subscribers SET last_sent_date = ? ...
AND last_sent_date IS NOT ?` (`last_weekly_sent` for the weekly lane) and
counts only when that changed a row. A send retried for the same
subscriber and day, such as a run that mailed and died before its own
bookkeeping, finds the stamp already set and adds nothing (the email can
still repeat; the count cannot). A crash between the stamp and the UPSERT
undercounts by one and never overcounts. `failed` counts failed attempts,
so a subscriber who fails on three runs adds three; it cannot be deduped
without storing who failed. `unsubscribed` is counted when the `DELETE`
removed a row, so a repeated click adds nothing. A write error is logged
and dropped, and a missing table (before 0067) is silent, so counting never
stops a send or an unsubscribe. `GET /api/system/mail-stats` sums the last
28 days per language for the /data Audience tab ("Digest delivery").

**Weekly frequency.** `subscribers.frequency` is `daily` (default) or
`weekly`, and `subscribers.weekly_day` (0 = Sunday … 6, default 1 = Monday)
is the local weekday a weekly subscriber wants the mail
(`src/lib/mail-frequency.ts`; both columns are added at runtime by
`ensureMailSchema`). Weekly subscribers are skipped by both daily lanes.
On their weekday, from 07:00 local, `sendWeeklyLane` mails the digest of
the 7 audience-zone days before their local date (§10c), read from the
shared row for that end date: the ISO-week edition (`weekly_snapshots`,
with issue number and a `/week/YYYY-Www` link) when the window ends on a
Sunday, else `weekly_digests`. Nothing is built or summarized per
subscriber; rows are loaded once per (end date, language, size). The story
lines come from that language's column only (an empty VI column sends
nothing and the next run retries), cut to the subscriber's digest size, and
render through `renderDigestEmail` with a `weekly` block: subject
"AI;DR Weekly #N — lead headline" (no number for a rolling window), the
range in the header, the intro paragraph, and after the stories the
window's videos in that language as text links in date order
(`utm_content=video-YYYY-MM-DD`). It has no daily video card and no
per-day feedback row. A title-only `fallback` digest waits until 13:00 local for the LLM
retry. Idempotency is `subscribers.last_weekly_sent` (the end date mailed; a
legacy `YYYY-Www` value reads as that week's Sunday). A new window may
overlap the last one by at most 3 days (`WEEKLY_MIN_GAP_DAYS` = 4), so
moving the send day earlier still mails that week and moving it later in
the same week waits for the next one. The digest build waits whenever the
ISO-week build attempted an LLM call in the run, even a failed one. A failed send is not stamped and
retries next run. Preview: `GET /api/subscribe/preview?lang=&n=&format=&freq=weekly`
(newest digest of either kind).

### 12. Notify (`worker/notify/`)

Pluggable channel adapters (Telegram, the English Facebook Page,
plus optional JSON/Slack webhook via `NOTIFY_WEBHOOK_URL`),
deliberately non-spammy.

- A normalized `AlertEvent` (severity, source, title, summary, metrics,
  links, optional health snapshot) is the internal shape. Adapters in
  `worker/notify/adapters.ts` render Telegram HTML, Slack
  incoming-webhook JSON, or raw JSON.
- *Daily digest*: one message per local day per channel
  (Asia/Ho_Chi_Minh, from 08:00), and no message for the stories that
  did not make the card. It is a `sendMessage` (4096 characters, not a
  1024-character photo caption) naming the six stories on the day card,
  each with the first sentence of that language's summary after the title
  when one exists. A first sentence that opens with the headline word for
  word (case and spacing ignored, a trailing "(@handle)" or "(Source)"
  ignored) and carries on replaces the headline: the line is that sentence
  alone. The card is the link preview, large and above the text:
  `link_preview_options.url` is the versioned card PNG
  (`/api/og/date/{date}.png?lang=&v=`, `v` a hash of the tile ids). The Bot
  API does not need that URL in the text, and pointing at the image instead
  of the day page keeps Telegram's cached page preview out. Six full lines
  normally fit. Only when they pass 4000 visible characters does
  `fitHighlightDigest` drop summary clauses (longest first, a clause is a
  whole first sentence or nothing) before it shortens any headline, at a
  word boundary. This is that calendar day's ranked stories, photos first,
  not the rolling 24h TL;DR. Email still sends the snapshot (`bullets_vi`
  / `bullets_en` only, no cross-language fallback). The Vietnamese channel
  (`TELEGRAM_VI_CHAT_ID`, falling back to `TELEGRAM_CHAT_ID`) and the
  English channel (`TELEGRAM_EN_CHAT_ID`, same bot token) each use their
  own language. Each line links to its story permalink. The first button
  opens the day page; "▶ YouTube" follows once the day video exists ("Day
  archive" above). When the day has no card stories, the message lists
  the first six bullets of that language's snapshot and the preview is the
  day page. The send waits up to 45s, like a photo: Telegram may fetch the
  cold card for the preview before it answers.
- *Digest highlight* (Telegram, `postsDigestHighlight`): right after the
  digest, the card's top story goes out once as a normal story post
  (`sendStory`: its own photo or album, the full caption summary, the Read
  button). The story is loaded in the channel's language only
  (`channelCopy`) and must pass the trending postability gate. When the
  top story fails the gate on that channel, the next card stories are tried
  in order, up to `HIGHLIGHT_CANDIDATES` (3); the story posted is the run's
  `highlightStory` reason, and the row's `last_error` lists the stories
  passed over. When none passes, or the day has no card stories, the row is
  `skipped`: nothing posted, and scheduled runs never re-claim it; only the
  admin force-send reopens it. It is keyed `digest:<date>:top` in
  `notifications`, claimed like every send, and runs only when that day's
  digest row is `sent`, in the same run or within `HIGHLIGHT_WINDOW_MS`
  (3h) of it: an `ambiguous` or `sending` digest never triggers it, and an
  older digest (sent by a previous deploy) gets no late highlight. Only the
  gate falls through to the next story. A definite send failure retries
  the pick on later runs up to
  `NOTIFY_MAX_ATTEMPTS`, inside that window; the digest is not resent. The `digest:`
  prefix keeps it out of trending's daily count, 3h gap and posted-events
  window, and its story is already in `notify_digest_items`. The admin
  force-send follows a sent digest with the highlight under the same key;
  the staging preview sends both and records neither.
- *Trending*: an individual post only when the algo flags a story as
  exceptional (`rank_score` at or above the trending bar and
  `llm_importance ≥ 7`), capped at
  3/day with a 3h minimum gap, one per run, and only during 09–23h
  local: a story that qualifies overnight waits for the window and posts
  then if it still ranks (before this the cap was often spent by
  morning and the channel stayed silent all day). On a big-news day (a
  launch event, a run of major stories) a story with
  `llm_importance ≥ 9` may go past that cap and gap, up to 6/day with a
  1h gap; the day's own scores open the extra room, no event list is
  kept. Digest is the intended daily Telegram post.
- The trending bar is relative, so a rescored formula cannot silence or
  flood the channel: `max(TRENDING_RANK_FLOOR = 3, the 0.98 percentile
  of rank_score over published items in the last 72h)`, read once per
  notify run. Both lanes use it. At 0.98 (about the top 8 of ~400) the
  daily cap and gap do the limiting; 0.995 with a floor of 6 left the
  channels silent once the rank scale fell to a 3–8 max (2026-10-02). The
  floor keeps a dead window's weakest stories from posting.
- *Trending never repeats an event and never posts junk copy*
  (`worker/notify/post-quality.ts`, `posted-events.ts`). Both checks run on
  the full candidate query result, before `pickDiverse`, so a rejected story
  frees its slot for the next one instead of costing the run its post.
  - **Postability gate** (`postability(story)`, pure): the channel-language
    summary is rejected when it is missing (`gate:missing`, a title-only
    post), carries source chrome anywhere (`gate:chrome`: "Back to live
    feed", "N stories across N day", "Skip to content", "View the full
    context on <outlet>", the patterns `stripSourceBoilerplate` strips, plus a
    "5 min read" opener), or is under 80 characters (`gate:short`, which
    catches the "From <outlet>." stub). Digest lines get the other half: the
    day card's summary clause and the snapshot bullet text pass through
    `stripEmbeddedChrome`, so chrome that reaches a stored summary never
    becomes a digest clause.
  - **Cross-post dedup**: each `PostedEvent` is
    `{channelGroup, itemId, canonicalId, eventKey, postedAt, kind}`. The
    channel's events are its trending posts in the last 48 hours (statuses
    `sent`, `ambiguous`, `sending`) plus every story its digest carried on the
    current and previous local dates. `canonicalId` is the `duplicate_of`
    chain root. A candidate is dropped when its root matches a posted root
    (`dedup:canonical`), or when its event key matches (`dedup:event`). Two
    stories with one publisher article id (`articleId`, a vnexpress article
    and its `-tong-thuat` live page) are one event whatever their titles say
    (#765). Otherwise the key needs a
    source-title token Jaccard of at least 0.2 with at least 3 shared tokens
    (`significantTitleTokens`, the merge step's tokenizer) and at least two
    shared named entities (names from `extractProtectedTerms`, plus a short
    org list, minus filler like "AI"; a name found in either title counts
    once the other title contains it as a whole word, because a Title Case
    headline hides its own names from the extractor). 0.2 sits between the
    2026-10-08..11 audit's same-event pairs (0.21 Nvidia/Reflection across
    outlets, 0.35
    TypeSafe) and its different-story pairs sharing an entity (0.03 to
    0.10). Two shared names and three shared tokens are there because the
    ratio alone matches different deals by one company: "Nvidia signs AI chip
    deal with Saudi Arabia's Humain" vs "Nvidia Negotiates $25B Reflection AI
    Deal" scores 0.23 on Nvidia, AI and "deal", and short pairs like "Nvidia
    launches Rubin GPU" / "Nvidia stock falls on Rubin delay" clear 0.2 on two
    words. The `source_lang` column picks the Vietnamese rules, not a
    diacritic, so "Société Générale" stays English (#766). A Vietnamese
    title's names are its capitalized words after each sentence's first,
    because `extractProtectedTerms` reads English and cut "Việt Nam" into
    "vi" and "nam". An English title's names are read and matched with
    diacritics folded, since the same extractor cut "Société" to "soci"; a
    Vietnamese title keeps its marks, or the "Nam" of Việt Nam would match
    every "năm". Titles are NFC first. Two Vietnamese-source titles compare
    `evidenceTokens` words instead of syllables, with the same 3 and 0.2. In
    syllables, headlines on one Nobel prize scored 0.18 and different stories
    sharing "Việt Nam" and "công nghệ" 0.21 to 0.25 (#756). A
    Vietnamese-source story and an English one compare English copies: the
    Vietnamese story's vi→en translation title (`translations`, lang `en`)
    against the English title, with the English tokens, and with the names of
    both source titles. "AI", "US" and the other filler names do not count as
    shared tokens in this compare. On source titles such a pair shares only
    its Latin names, and "Meta", "Muse" and "AI" tied a VnExpress analysis of
    Muse to four different English Muse stories (#786). Until the translation
    exists, the source titles are compared under the same token rule. No LLM
    call.
  - **Not in v1**: a repost for a material update (a changed number, a new
    development) is never allowed, because telling an update from a rewrite
    needs more than a title compare and a wrong "update" is a duplicate post.
    Two stories about one event with no shared title words ("OpenAI defends
    firing three safety researchers" and "Fired OpenAI staff dispute
    misconduct charges", 0.09) still both post. A follow-up whose headline
    names the event ("Cybersecurity Stocks Fall After Google Unveils Gemini 4
    Argon") matches the event in English and across languages, because it
    shares more title words with the launch than a second launch report
    does.
  - **What the digest showed**: `notify_digest_items` (migration 0057) holds
    the story ids of each digest, written when it sends: the day card's six
    stories (what the message lists), else every id the snapshot's bullets
    cite. Ranked stories below the card are not recorded, so trending may
    still post them. The TL;DR snapshot cannot stand in, because it is rewritten every
    run and by trending time cites the very stories trending would post.
    Apply 0057 before deploying; without the table digest dedup is off and the
    Worker logs it. A channel with no digest row for the date (failed, not yet
    sent) contributes no digest events.
  - **Recorded**: `workflow_runs.stats.notifyReason.<channel>.suppressed` is a
    count per reason (`dedup:canonical`, `dedup:event`, `gate:chrome`,
    `gate:short`, `gate:missing`) for the candidates that run dropped. A
    blocked candidate is re-judged and re-counted every run until it ages out
    of the 24h window. The `notify` step line stays unchanged (240-character
    cap).
- *Why this ranks* (story page, "Chi tiết bài viết" aside): `GET /api/story/{id}?ranking=1`
  adds `ranking` from `worker/notify/story-ranking.ts`: day rank (Asia/Ho_Chi_Minh day, `archiveDateOfSec`),
  `rank_score`, importance, the live bar (same `trendingRankBar`), and per
  channel (`telegram`, `telegram-en`) either the `notifications` post time or
  the reason not posted: below_rank / below_importance / too_old /
  outside_hours / budget_spent / pending / send_failed (a failed
  row at `NOTIFY_MAX_ATTEMPTS`, never retried). The homepage arrow means only "top
  story of its (Vietnam-time) day", not a Telegram trending post.
- Skip reasons are structured (`digest`: no_snapshot / empty_after_strip /
  already_sent / before_hour; `trending`: outside_hours / below_min_rank / budget_zero /
  none_unposted, with the live 24h max rank and the bar) and
  `console.info`'d plus stored on
  `workflow_runs.stats.notifyReason`.
- Delivery state (status/attempts/last_error, bounded retries) lives in
  the `notifications` table, keyed by channel and item/date rather than
  locale. Telegram site links use flat `/{8-char}` permalinks with explicit
  `lang=vi|en` plus `utm_source=telegram`; publisher links keep their own
  URL and receive only the Telegram attribution parameter.
- Claim before send: each digest or trending send first upserts its row to
  `sending` in one statement (`claimDelivery`), and only the dispatch whose
  write changed a row sends. A retried notify step or a forced run that
  overlaps a scheduled one finds the claim and posts nothing. A `sending`
  row is never re-claimed, however old: no outcome was recorded, so it is
  final like `ambiguous`.
- The bounded Telegram Instant View decision, locale URLs, field/media
  gates, and fallback checklist are in
  [`docs/decisions/telegram-instant-view.md`](../../docs/decisions/telegram-instant-view.md).
  IV is not enabled by this document; keep the normal message/photo path
  until product and operations approve a manual POC. That record is a
  **no-go**; the only automation it gained is a *field gate*
  ([`worker/telegram-iv.ts`](worker/telegram-iv.ts)) that checks
  `title`/`body`/`published_date`/`image_url`/`site_name`/`description`
  for one `{id8}` + `lang` and answers `iv_eligible` with a reason. Run it
  with `verify-aidr doctor iv --id <8hex> --lang vi|en` or
  `GET /api/admin/notify/iv`. It invents no `rhash` and no query template.
- `sendMessage`/`sendPhoto` set `link_preview_options` explicitly rather
  than inheriting the API default. Story posts set `is_disabled`: a preview
  would attach to one arbitrary link or double the photo. The digest pins
  its preview to the day card with `prefer_large_media` and
  `show_above_text`. Rationale per flag is in `worker/notify/telegram.ts`.
- The trending post carries **one** inline button, "Read →" / "Đọc bài →",
  pointing at the aidr story permalink (`/{id8}?lang=` + UTM). It used to be
  two — "Read →" to the publisher, "AI;DR" to the permalink — which meant the
  image above and the link pointed at different stories. One canonical
  locale-stable URL for both.
- Not a `t.me/iv` wrapper: Instant View needs an editor-approved template and
  an editor-generated `rhash`, which exists only inside the operator's IV
  Editor session. Telegram's plain link preview from the page's own Open
  Graph tags is the documented fallback
  ([`docs/decisions/telegram-instant-view.md`](../../docs/decisions/telegram-instant-view.md)).
- **Telegram text always fits; nothing is cut mid-word** (`worker/notify/fit-text.ts`).
  A trending caption has 1024 visible characters; the summary gets what the
  title, meta line and album Read link leave (`storySummaryBudget`, at most
  500). Leading summary text that only repeats the title is dropped first
  (`worker/notify/headline-repeat.ts`): each leading sentence loses its
  byline ("Robert Hart / The Verge :") and splits into clauses at a spaced
  dash, and a clause goes only when its content words are nearly all the
  title's and it adds no number, no name, no hedge, denial or negation
  ("reportedly", "not", "phủ nhận", "theo"), and names the title's names in
  the same order. The first clause that adds a fact stays, so a
  "<headline> — <dek>" summary keeps its dek. In order: the channel's own
  summary when it fits and does not read as source copy (an RSS "appeared first on" footer, or a paper, blog or
  press release speaking as "we", "chúng tôi", "tôi" or "bạn"); else a stored
  rewrite in `notify_summaries` (one LLM call at send time through
  `completeJson`, only for the story about to be posted, keyed by item and
  language, regenerated when the source summary changes; an answer over the
  budget keeps its whole leading sentences that fit; rejected unless
  non-empty, finished, no ellipsis, and in the channel's language);
  else whole leading sentences with no ellipsis; else whole words plus `…`.
  A failed model call never blocks the send. Raw text is cut first and
  escaped after, so an HTML entity is never split.
- A trending story with two or more images uses `sendMediaGroup` (2–10
  photos: the story's own manifest images and video posters). One image
  stays `sendPhoto` so the inline button remains — an album has no
  `reply_markup`, so that link moves into the caption.
- **Video** (`worker/notify/video.ts`): a manifest video is preflighted with
  bounded Range requests over `fetchWithSafeRedirectsResolved` (never a full
  download): MP4 container, at most 20,000,000 bytes (Telegram's "20 MB" is
  decimal, not 20 MiB), at most 300 s (`mvhd`, faststart or trailing `moov`),
  size and duration known. `http://` videos are probed and sent as `https://`
  (the fetch policy refuses clear-text HTTP outside a few hosts, so they used
  to be skipped as unreachable and the story went out as a photo). Up to 3
  distinct videos are probed in manifest order; the ones that pass are
  planned. Proven video-only stories use
  `sendVideo` (with the poster as `thumbnail` only when it is a legal JPEG
  thumbnail); video plus images uses one mixed `sendMediaGroup` (primary
  video, its poster, then manifest order, deduped by `mediaIdentityKey`, at
  most 10 items, at most 40 MB of video). A generated share card never goes
  out with a video, as a still or as the poster, so a story with a video and
  only a share card sends the video alone. Email and the site still use the
  card as the story's image. An over-cap album is dropped whole,
  never truncated. A skip, or a call Telegram rejects, falls back to the
  photo path, then text. Durable multi-message delivery remains a follow-up.
- **Fallback reasons are recorded.** Every downgrade (video to photo, photo
  to text) keeps its reason in `notifications.last_error` on the `sent` row
  as `fallback ok: <r1>; <r2>` (`fallback failed: ...` when the text send
  also failed) and in one `telegram_story_fallback` JSON console warning
  (`story`, `reasons`, `delivered`). Reasons: `video:<unsafe_url|unreachable|
  size_unknown|oversized|not_mp4|duration_unknown|too_long>` (one per probed
  video), `album:too_many_items`, `album:over_byte_budget`,
  `video:plan_failed:<msg>`, `video:none_sendable`, `sendVideo:<Telegram
  description>`, `sendMediaGroup(video):<description>`, `sendMediaGroup:<d>`,
  `sendPhoto:<d>` (`<d>` is `media guard: <reason>` when the guard refused
  the URL before the call), `gallery:<guard reason>` (an image left out of
  the gallery before any call, such as a GIF; the rest still go),
  `photo:none_sent` (every gallery image was rejected),
  `photo:no_usable_image` (the story had none), `preview:no_publisher_url` /
  `preview:unusable_publisher_url` (the text post went out with its preview
  off). A `photo:` reason, or any `media guard:` refusal, also reaches
  Bugsink (`kind=story_media`) whether the post was delivered, refused or
  ambiguous. The one reported at `info` level is a delivered post whose only
  reason is `photo:no_usable_image` with its publisher preview pinned (a
  Hugging Face paper with no image of its own, as 76f3c65e); everything else
  stays `error`. Ambiguous and budget-exhausted sends keep their own error.
- **What is checked before a send.** Every Bot API call passes
  `checkTelegramMedia` (`worker/notify/telegram-media-guard.ts`) inside
  `callTelegram`, keyed by post kind (`story`, `digest`, `day_video`). A
  story call may not carry the first-party share card (`/api/og/<id>` on
  `aidr.today` or `www.aidr.today`, with or without `.png`, http or https;
  the day card `/api/og/date/<day>` is not it) as photo, album item, video
  thumbnail, `editMessageMedia` media or text preview
  (`image:first_party_card`), nor preview any other first-party page, whose
  `og:image` is the card (`text:first_party_preview`). A `sendMessage` or
  `editMessageText` must pin `link_preview_options.url` on a public http(s)
  host (`text:no_preview`, `text:unsafe_url`), so Telegram never picks the
  preview from the text; only a story may set `is_disabled`, for a publisher
  URL that cannot be previewed. A media call must carry media
  (`image:missing`, `album:empty`, `video:missing`); an image URL must be
  https on a public host (`image:unsafe_url`) and not a type Telegram
  refuses by URL, GIF, SVG, AVIF, BMP, TIFF, HEIC, ICO, read from the
  extension or a `format=` query (`image:unsupported_type:<ext>`). A
  rejected call posts nothing and answers like a definite `ok: false` with
  `media guard: <reason>`, so the sender's own fallback chain runs and the
  reason lands in `last_error`; it is also logged as one
  `telegram_media_guard` JSON warning. The poster is fetched and checked
  (JPEG, at most 200 KB, at most 320 px) only when it is about to be used as
  a `sendVideo` thumbnail; a poster that fails is left out and the video
  still goes. Gallery photos (`sendPhoto`, album photos) are not
  preflighted for reachability or size: Telegram fetches them and answers
  with a definite rejection, and if it rejects one the post tries the next
  gallery image (at most 3 photos, in order), then text.
- **Ambiguous sends are never repeated.** Only a JSON answer from Telegram
  is a definite outcome. `ok: false` posted nothing, so the next transport
  may run and the row is `failed` (retried up to 3 attempts). A timeout, a
  dropped connection, or a non-JSON body (a proxy error page) is
  *ambiguous*: Telegram downloads media itself, so the message may already
  be posted. An ambiguous call ends the send with no fallback, is recorded
  as `notifications.status = 'ambiguous'`, and is reported to
  Sentry/Bugsink. That row is final: the trending query and the digest gate
  skip it on later runs, and it does not count as a post. The cost is a
  story or digest that is missed when the call really did fail; the owner
  checks the channel and can resend a digest from admin. An album is one
  message: its Read link is in the caption, not a second reply.
- **Media: the story's own image, else text with the publisher preview.
  Never the share card.** The post leads with the story's real photo
  (manifest images and video posters, the normalized thumbnail as the
  single-image case). A story with no usable image, or whose first 3
  gallery images Telegram rejects (hotlink-hostile or dead upstream URLs),
  goes out as `sendMessage` with `link_preview_options.url` pinned to the
  publisher page (`storyTextLinkPreview`, large media above the text), so
  Telegram fetches the publisher's own `og:image`. A publisher URL the guard
  cannot preview (empty after canonicalization, a private host) sends the
  text with the preview off rather than losing the story; the aidr page is
  not pinned instead, because its `og:image` is the card. The first-party OG card
  `/api/og/{id8}.png?lang=` is a text graphic and is not a story's media in
  any position: not the lead, not a retry, not the preview (the guard above
  rejects it even when a row's `image_url` is the card). The reason is
  recorded (`photo:no_usable_image` or `photo:none_sent` in `last_error`)
  and the owner is told through the delivery alert path
  (`reportDeliveryFailure`, tag `kind=story_media`), because a story without
  its picture is an ingest defect to fix, not a silent downgrade. Before
  #622 the card was the lead; between #622 and this rule it was the
  fallback, and 4 of the 45 trending posts in the 14 days to 2026-10-15 went
  out on it (every one an empty manifest). The card still serves the site's
  `og:image` and email. A post already sent on the card gets its real image
  later with `pnpm --filter @aidr/web telegram-swap-card` (dry unless
  `--apply`). It edits only when D1 says the card went out and the live
  photo is 1200x630, tests the image in the staging chat first, and logs
  every edit to `admin_audit` as `telegram.edit_media`. Its bot calls pass
  `checkTelegramMedia` too, so it cannot stage or edit the card onto a post.
- **Each channel is one language.** `telegram` is `vi` and `telegram-en`
  is `en`. Digest bullets come from that language's edition
  (`worker/digest/edition.ts`) and never from the other column. Trending
  copy is chosen by `Notifier.lang` with no fallback (`channelCopy`): the
  `translations` row for that language when it has a title, else the
  source text only when the source is already in that language, else the
  story is skipped on that channel. A VnExpress story reaches `telegram-en`
  through its vi→en translation. A second locale is another notifier entry.
- **Facebook** (`facebook-en`) is English only and uses the same gates.
  Each send is one `POST /{page-id}/feed` link post (`message` + `link`)
  on Graph `FACEBOOK_GRAPH_VERSION` (default `v26.0`). The message is the
  full edition or the full story summary, one paragraph per sentence.
  It is not clipped to a caption line. The link is the day
  page or the story permalink on `SITE_URL` (the install origin, default
  `src/lib/site.ts`) with `utm_source=facebook`. The Page preview comes
  from that page's own
  Open Graph tags. There is no photo upload, no video, no comment, and no
  Messenger send. Copy that asks people to like, share, or comment is
  refused before the request. Error codes 10, 100, 190, 200, and 368 are
  stored as `ambiguous` and not retried. Rate limits (4, 17, 32, 80001,
  80006) wait for the next run. `FACEBOOK_PAGE_ID`, `FACEBOOK_APP_ID`,
  `FACEBOOK_APP_SECRET`, and `FACEBOOK_PAGE_ACCESS_TOKEN` come from the
  install's `.env.local`. None of them are committed. The Page token posts.
  The app id and secret only mint a replacement Page token. The secret stays
  in `.env.local`: no Worker or workflow reads it, so nothing syncs it.
  The daily video Reel on the same Page is not the Worker's: it comes from
  `.github/workflows/daily-reel.yml` (`videos/daily-news/scripts/facebook-reel.mjs`),
  once a day, with the same Page token and the same engagement-bait regex.

### 13. Review gates (LLM, rating ≥ 0.6)

User translation suggestions and
HN-style story submissions are judged (faithfulness / relevance / not
spam; submission text is treated strictly as data, never instructions)
before they touch the feed. Jev (`typesafe/jev`,
`POST /api/v1/systemone`, BYOK-only via Dashboard → BYOK → TypeSafe) is
tried first as a typed decision (`noul` intent/spam + `score` quality
mapped to relevance/rating); any Jev failure falls back to the existing
chat-completions JSON judge. `/api/system` lists that chat chain after
Jev on `models.decisions`. With `JEV_PANEL_ENABLED`, the JEV review
panel then gives a second opinion that can only lower the value
(submissions: scoring panel; suggestions: fidelity + safety panel).

Accepted submission URLs are stored without tracking parameters
(`canonicalSubmissionUrl`), so they hash to the feed's item id. A
blank-title submission takes the page's `og:title` and its
`article:published_time`. Submissions skip the keyword prefilter (a human
chose them) but still face the `relevance < 0.4` hide rule.

**Suggestions are reviewed on submit** (`worker/suggestions.ts`). A
signed-in reader edits the title or summary of the language on screen:
`vi` rewrites the Vietnamese translation, `en` rewrites the English
source of an English-source story (never ids or urls). The submit
server fn stores the row and runs `reviewSuggestionById` in the
request's `waitUntil`, logging LLM calls under a
`suggestion-review-…` run id. Flow per suggestion: claim
(`pending` → `reviewing`, conditional UPDATE) → rate (Jev, else chat
judge) → JEV panel can only lower → if rating ≥ 0.6, rewrite keeping the
reader's intent → output guard (no new links or markup, no runaway
length; a fooled model still cannot publish a payload) → text and
verdict written in one batch. Outcomes: `accepted` (with
`applied_text`, which may differ from the reader's text), `needs_review`
(valid, 0.4 ≤ rating < 0.6, waits for an admin), `rejected` (with the
reason). The hourly `review-suggestions` step is the safety net: it
reviews rows still `pending` and `reviewing` claims older than 10
minutes, never `needs_review`. Readers poll their verdict and see full
history (suggestions + submissions, keyset paged) on `/submit`; both
reads are keyed by the Clerk session user. TL;DR bullets are not
editable: snapshots are regenerated hourly and already sent.

**Free-form suggestions** (`field = 'auto'`, the default). The reader
writes one suggestion in any language; one planner call (chat judge,
no Jev) sees the source and Vietnamese title + summary and returns a
rating, a reason and edits for only the fields it names, limited to
vi.title, vi.summary and the English title of an English-source story.
Every edit passes the output guard (one failure rejects all), all edits
land in one batch, and `applied_changes` stores `{lang, field, before,
after}` per field. A valid comment with no concrete edit goes to
`needs_review`. Fixed-field rows from before keep the old path.

**Translation knowledge** (`worker/translation-knowledge.ts`, table
`translation_knowledge`). After an accepted VI suggestion (instant
review or admin approve) one extra call asks whether it teaches a
reusable rule (`keep_english` / `preferred_term` / `avoid`) or is a
one-off. Rule fields are validated as short terms (no newlines, links,
or sentences). A rule goes `active` only when the review rating is
≥ 0.9 (admin approve counts as 1) and the edit itself proves it (term in
the source, forbidden phrase removed); otherwise `pending` for an admin
(`GET /api/admin/knowledge`, `POST /api/admin/knowledge/decide`
`{id, status}`). Active rules matching the input add a "Glossary" block
(≤ 8 rules, ≤ 800 chars) after VI_STYLE in translate, TL;DR, suggestion
rewrite and QA repair prompts, and translation QA fails `terminology`
when the EN source has the term and the VI text has a forbidden phrase
→ repair; each catch increments the rule's `hits`. Seeded: "agent"
stays English, "đại lý"/"đặc vụ" fail ("tác nhân" is allowed).

**Email contributions** (`docs/decisions/email-contributions.md`).
Mail to `submit@aidr.today` reaches the `aidr-email` Worker
(`apps/email`), which only validates and stores: sender authenticated
by Cloudflare (DKIM or SPF aligned with the From domain, read only above
the first `Received:`), From = envelope sender, address = a live Clerk
account email that Clerk marks verified (`clerk_users.email_verified`,
from the webhook / clerk-sync) or another address Clerk has already verified (`clerk_verified_emails`), no
auto-reply/bounce/list mail, ≤ 1 MiB, ≤ 20 per user per day. It writes
an `inbound_emails` row: `pending` with parsed fields (the user's own
text, links, story reference), or `ignored` with a reason and no
content. No LLM runs there. The hourly `inbound-email` step (before
`review-suggestions`) turns pending rows into a submission (forward or
new mail with one link), a suggestion on the referenced story
(`submit+<id8>@`, `[aidr:<id8>]` subject marker, or one aidr.today story
link in the user's own text; `title:`/`summary:` prefix = fixed field,
else `auto`) or a comment, then acks from notes@ with
`Reply-To: submit@`. Review happens in the normal gates later in the
same run.

## Model bench

`pnpm --filter @aidr/web model-bench` (`scripts/model-bench.ts`) runs any
model list through each LLM step with the real prompt builder and parser,
one model at a time (no fallback hop; the failing-model skip list resets
between models), and scores the output against datasets built from prod D1.

```bash
pnpm model-bench build [--steps score,tldr]      # SELECT-only refresh of fixtures/bench/*.json
pnpm model-bench run --steps score,jev,translate-en-vi --models a,b --limit 10
pnpm model-bench report a.json b.json --out scripts/fixtures/bench/reports/<date>.json
```

No `--models` = the step's wrangler.toml chain. Output: JSON plus a
markdown report per step (quality, schema-valid rate, step metrics,
p50/p95 per call, unit errors, 429s, tokens, billed and list-price cost)
and a recommended chain per env var. The recommendation drops review ids
that sit in a generator chain, and drops aliases from concrete-only vars.
It does not know slice budgets or BYOK, so check the wrangler.toml comments
before applying it. A run where every attempt failed with a provider error
(BYOK, credit, 429, 5xx) is marked unavailable and left out of the ranking.
Run it before changing any model chain.

The bench uses the prod key, so it shares the prod rate limits and BYOK
quotas. Run one step at a time (`--concurrency` defaults to 2). On
2026-10-02 the z-ai BYOK upstream ran out of balance ("Insufficient
balance" 429) while 7 bench processes ran in parallel. Prod `glm-4.6` review
then logged its first failure of the day, so the bench may have helped
drain it.

| step | prod call → bench adapter | env var | output checked | label |
|---|---|---|---|---|
| `score` | `scoreBatchPrompt` → `sanitizeScoreResults` (chat backup) | `ANYROUTER_MODEL` | relevance, importance, quality, category, tags | gold importance band (`importance-eval.json`), silver status/category/tags |
| `decision` | `callSystemOne` + `jevScoreQuestions` → `scoreJudgmentFromJev`; an answer not served by Jev is a miss, as in prod | `ANYROUTER_DECISION_MODEL` | same, plus `servedByJev` | same as score |
| `jev` | same call, any answer counts | `ANYROUTER_JEV_MODEL` | same | same as score |
| `translate-en-vi` | `translateItems` (VI_STYLE + glossary) | `ANYROUTER_TRANSLATE_MODEL` | protected terms, knowledge rules, blind back-translation by a fixed judge | gold: accepted suggestions, active knowledge rules; silver: stored VI |
| `translate-vi-en` | `ENGLISH_TRANSLATION_SYSTEM_PROMPT` + `buildEnglishCandidatePrompt` → `parseRepairCandidate` | `ANYROUTER_ENGLISH_TRANSLATE_MODEL` | name keep, recall against stored EN | silver |
| `review` | `requestReview` → `reviewPasses` | `ANYROUTER_REVIEW_MODEL` | pass/fail | silver `qa_rating` |
| `tldr` | `generateTldr` | `ANYROUTER_TLDR_MODEL` | bilingual, item ids, bullet length, coverage | silver `tldr_snapshots` |
| `cluster` | `clusterSimilar` | `ANYROUTER_MODEL` | same-story F1 | silver `duplicate_of` (distinct titles only) |
| `topics` | `buildTopicMappingPrompt` → `parseTopicMappingResponse` | `ANYROUTER_MODEL` | canonical mapping | silver `topics.canonical` |
| `draft-repair` | `translateBatch` with the draft check's `fix` lists (the one repair pass in `translateItems`) | `ANYROUTER_TRANSLATE_MODEL` | `acceptsRepair` (fewer issues, still VI, ≥80% length), all issues resolved | derived: stored VI rows `translationDraftIssues` flags, stratified by issue type |
| `rule-extraction` | `buildRuleExtractionPrompt` → `validateRule` + `ruleIsEvidenced` (as `learnFromAcceptedSuggestion`, no D1 write) | `ANYROUTER_TRANSLATE_MODEL` | class-balanced: reusable + term + evidenced on positives, "one-off" on negatives | gold: active rule examples; derived: stored VI with a rule's `bad_vi` substituted, one-number fact fixes |
| `suggestion` | `buildReviewPrompt` → `parseReviewResponse` (per field), or VI_STYLE + `buildUnifiedReviewPrompt` → `parseUnifiedVerdict` (`auto`), mapped to accepted / needs_review / rejected with prod thresholds (no output guard, no panel) | `ANYROUTER_TRANSLATE_MODEL` | status agreement | silver `translation_suggestions.status`; accepted rows left out (the applied edit is already in `translations`) |
| `submission` | `buildSubmissionReviewPrompt` → `parseSubmissionVerdict`, accept at ≥0.6 (the chat fallback; prod asks Jev first) | `ANYROUTER_MODEL` | accept/reject agreement | silver `submissions.status`; og:description re-fetched at build for every case |
| `judge-relevance`, `judge-source-quality`, `judge-safety` | `createJevJudgeExecutor`, one seat, score-panel or submission-gate subject shape | `JEV_PANEL_{RELEVANCE,SOURCE_QUALITY,SAFETY}_MODEL` | support/oppose agreement; abstain or transport failure = invalid | silver `items.status` published/rejected and `submissions.status` (`judge-score.json`; panel never ran in prod, no stored votes) |
| `judge-translation-fidelity` | same, translation-gate subject shape | `JEV_PANEL_TRANSLATION_FIDELITY_MODEL` | same | silver `qa_rating` ≥0.7 and rejected suggestions (`judge-translation.json`) |

The `cluster` row is silver, so a model that merges what prod missed
scores as a false positive. `scripts/cluster-gold-eval.ts` scores the
cluster call against hand-labelled same-story groups that reached the prod
24h pool unmerged on 2026-10-10 (`fixtures/quality-bench/cluster-gold.json`,
96 rows, topic-only negatives included). Rank cluster models on it first.

Not benched yet: repair (`requestRepair`), suggestion retranslate
(`suggestions.ts`), and digest wrap (`mail/compose.ts`). Review-queue data
is thin (2026-10-02: 2 usable suggestions, 12 submissions), so treat those
two steps as smoke checks, not rankings. Silver metrics show how close a model is to the
current prod output, not whether it is correct. Rank models on gold and
deterministic metrics first. Datasets hold no user ids, names or IP hashes.

## LLM transport

All calls go through `callAnyrouter` (`worker/llm.ts`):

- Streaming SSE (bypasses anyrouter's queue for long prompts).
- JSON mode.
- `temperature` 0, except on `anthropic/` ids: current Claude ids (5.5)
  reject it with a 400.
- `max_tokens` 8192 (2048 on translate).
- Reasoning-model fallback (extracts JSON from `message.reasoning` when
  content is starved).
- Comma-separated model fallback chains (`ANYROUTER_MODEL`).
- Skips (isolate-wide): a 404 skips an id for 15 min for the task that got
  it, and a 429 skips it for 2 min for every task. A chain whose every id
  is 429-skipped sends nothing for those 2 min. Inside a run
  (`withLlmCallContext`), an id that times out 3 times in a row in one task
  is skipped for that task for the rest of the run; a served call resets
  the count.
- Per-task overrides (`ANYROUTER_TRANSLATE_MODEL` /
  `ANYROUTER_TLDR_MODEL`).

Score tries Jev (`typesafe/jev` via `/systemone`, 30s cap per item) first,
then this chat chain:

- `google/gemma-latest` (rolling alias, served `gemma-4-31b` on 2026-10-10)
- `z-ai/glm-latest` (rolling alias, served `glm-5.2`)
- `@preset/aidr` (workspace preset, served `gemma-4-31b` on 2026-10-10)
- `anthropic/claude-sonnet-5-5` (paid last resort, usable on this key since
  2026-10-15)

`anyrouter/auto` left this chain on 2026-10-16 (#672): it served 0 of 97
calls in the 7 days before (cluster 0 of 48, score 0 of 41).

This chain also runs the cluster call. On the gold cluster set, Laguna
scored F1 0.51, while Gemma, GLM 5.2 and the preset scored 1.0. TL;DR uses
`openai/gpt-5.6-luna`, then Laguna (`anyrouter/auto` served 0 of 26 tldr
calls over 7 days). Translate, summarize and the VI→EN generator run
Laguna, then `google/gemma-latest`. Claude Sonnet stays off those chains
and TL;DR. A third id there shrinks the head hop: translate's 50s slice in
a 70s batch becomes 30s, and luna's EN-only TL;DR retry can drop from 40s to
20s. The VI→EN generator keeps only its first 2 ids. On 2026-10-14 `google/gemini-3-flash`
stopped serving (404, 502) and the `gemma-4-31b` :free route had served
nothing since 10-12, so both left every chain (#663). The rolling
aliases follow new models without a deploy, so re-probe what they serve
before reading a bench row as a fixed model.

TL;DR and translate use the same chain without Jev. The VI→EN generator
uses only concrete ids (`poolside/laguna-s-2.1`). The translation reviewer
(`z-ai/glm-4.6`) shares no id with any generator chain and gets a 45s budget
(`QA_REVIEW_TIMEOUT_MS`), 30s max for the first hop.

Translation review is paused in production (`TRANSLATION_REVIEW_ENABLED =
"false"`, #655). On 2026-10-13, 406 of 413 review calls failed:
`stealth/space-bunny-alpha` (0 of 484 in 7 days, now removed) and `glm-4.6`
(12 of 259 in 24 hours). Review is post-hoc QA. Translations publish at
translate time, and no site, email or Telegram query filters on the `qa_*`
columns, so the pause leaves every published translation as it was. While
paused, `qa-translations` still creates VI→EN candidates, logs one
`translation_review.paused` line, reports "review paused", and makes no
review or repair call. `gpt-5.6-luna` stays off the reviewer chain while it
heads `ANYROUTER_TLDR_MODEL`. Review timeouts no longer trip the id for
TL;DR, but the 429 skip is model-wide, so a reviewer 429 on luna would move
TL;DR onto its fallback for 2 minutes (#663). Re-enable after a measured probe on review prompts picks a
reviewer; the probe needs `ANYROUTER_LOCAL_API_KEY` (#656).

`@preset/aidr` is third on the score and cluster chain and on no other
chain. It served 2 of 101 calls in the 7 days to 2026-10-14 (#663).

An id that returns 404 (`model_not_found`, BYOK-only `model_unavailable`)
is skipped by later calls of the same task in the same isolate for 15
minutes. Other tasks keep it. A 404 is not model-wide: `gemma-latest`
served other tasks after 5 of 5 cluster 404s, and in run 1f3851a2
(2026-10-10) a translate 404 on gemini left TL;DR with only luna, which
hung, so a headline-only digest shipped. A 429 skips the id for every task
for 2 minutes, because it is the account quota or the id's capacity, which
every task shares: all 1,005 429s from 2026-09-30 to 10-14 fell in one 3-hour
window (10-13 21:00-24:00 UTC) across 9 ids and 5 tasks. The quota alert
(`llm-rate-limited`) counts 429 rows in `llm_calls` and does not read the
skip map. The translate batch, the VI→EN generator and translation repair
all log task `translate`, so they share their skips. Skipped ids take no
budget slice. If every id in a chain is skipped, the ids skipped for a 404
or a timeout streak are tried again, so a dashboard fix lands at once. A
429-skipped id is not: a chain whose every id is 429-skipped fails with
`anyrouter chain exhausted` and sends nothing until the 2 minutes end. In
run 23b4ed50 (2026-10-13) the old fail-open re-sent each item's full chain
after the first wave, 225 translate 429s in 88 s. 5xx and timeouts never
skip.

A failed `llm_calls` row keeps `response_snippet`, a JSON descriptor built
from allowlisted fields, never response text. A provider error keeps the
HTTP status and, from a JSON body, `error.code`, `type`, `status`, `param`
(a field name) and `message` (redacted, 120 chars, every token that is not
a plain word or lone number shown as `*`). A text body keeps its first 60
characters only when they are plain words (nginx's `502 Bad Gateway`);
otherwise the row says `non-json error body (N bytes)`. A rejected answer
keeps only its shape: length, first-character class, whether
`parseJson` reads it (or the error position), up to ten top-level keys
(a key no aidr prompt asks for is stored as `*`), whether it is fenced, and whether it used every allowed token. Transport
failures and timeouts keep none; `error_code` covers them. Ok rows,
`review` rows and `sensitive` calls keep none, and the logger drops any
snippet that is not a descriptor (`canonicalLlmSnippet`). Every call
whose prompt holds reader-written text (suggestions, submissions) passes
`sensitive`; `llm-reader-data-callers.test.ts` parses `worker/`, lists
each call site, and fails on any reference to `callAnyrouter`,
`completeJson` or `completeJsonWithModel` it cannot follow to a call
(aliases, re-exports, namespace aliases, computed members, dynamic
imports of `llm.ts`). A caller's `validate` check logs an answer it cannot use
as `bad_output` without moving the chain on. The Telegram caption summary
logs task `caption`: an over-long answer cut to whole sentences is ok, and
`bad_output` means the answer was dropped and the caption trimmed the
source instead.

`parseJson` drops stray closers when a plain parse fails: Laguna often ends
with an extra `]`, or closes the root `}` before `,"bullets_vi":[...]`.
Without that, a translate batch is lost and a TL;DR keeps only
`bullets_en`, so VI falls back to titles. The VI→EN generator and the
translation repair parse strictly (`parseRepairCandidate`) but drop exactly
one trailing `]` or `}`; the reviewer's output gets no such allowance.

Every attempt also has a first-token cutoff (`FIRST_TOKEN_MAX_MS`, 20s): a
model that streams nothing by then is logged as a timeout and the chain
moves on, so one hang cannot eat most of a batch budget. TL;DR and the
VI→EN generator keep 20s (#679). In the 7 days to 2026-10-14 all 37 TL;DR
timeouts (luna 12, `anyrouter/auto` 11, Laguna 10, gemini 4) died at 20s,
none at the 135s slice. Hangs came in runs: in 5 runs Laguna and
`anyrouter/auto` hung back to back, retry included, and 3 of 6 luna
retries hung again; the other 3 served, so a fresh call can rescue a
hang. On translate, where the cap is 35s, Laguna hung to the full 35s 9
times in 7 days. Of the 24 translate calls it led (a slice of 50s or more,
so the 35s window applied), 20 served with no sign of a slow start
(duration minus output time at its p90 speed: median 2.9s, max 19.2s) and
3 hung to 35s; a small sample. A
35s cap fits the shared 230s TL;DR budget (four hung attempts take 140s
instead of 80s), but when hangs come in runs it only delays the same
headline fallback by a minute. The VI→EN generator served 16 of 61
attempts in 7 days, all within 6s; 6 died at the 20s first-token cap and
39 were 5xx, 404 or invalid output. A higher cap there would also need a
slice above its 25s default.
Pick chain models with a streaming probe: production always sends `stream: true` with
`response_format: json_object`, and some models (Nemotron 3 120B / Super)
answer fine without streaming but never stream a token. `wrangler.toml`
keeps the probe results behind each pick.

`google/gemini-3.5-flash` is BYOK-only on AnyRouter and 404s for keyless
calls (anyrouter#3655). `minimax/m3` has no upstream key and returns
404/502 (anyrouter#3817). Both are out of every chain.

Hard-coded Gemma/GLM/Ling flash ids 404/502'd or are BYOK-only; do not
restore them. BYOK-only ids such as SEA-LION and Gemini 3.6/3.7/3.8 are
omitted, and stealth/ox-alpha was removed after AnyRouter delisted it.

Translate runs in batches of 3 (summaries clipped, title-only retry) and
each backfill slice is its own Workflow step so a finished batch is written
even if a later slice times out.

- Score batches of 5. One model attempt stays on the 70s hang-cap. The chat
  chain passes `timeoutMs` so two batches — decision 15s, Jev 30s, then
  chat — stay inside the 5-minute `LLM_STEP` (the 120s default made two
  batches about 330s). The ingest score step is one Workflow step per
  batch, so a finished batch is kept when a later one is interrupted, and
  that interrupt is not recorded as zero items scored.
- TL;DR uses a 135s hang-cap (Laguna needs 102-119s on the ~26K-char prompt).
- Translate attempts use a 60s hang-cap so `anyrouter/auto` is not killed
  mid-route (a 25s cap made every score/TL;DR model log 0 tokens).

None of these budgets are raised by adding sources. The flood gate above is
what makes extra coverage fit inside them: `scoreItems` runs 3 concurrent
batches of 5 (15 items) inside the 5-minute score step, and the measured steady state
is ~4 new items per run. Each new source row's `maxItems` is therefore capped
at or below one score batch (5), and the whole Vietnamese + newsroom addition
is bounded at 6 items per run per source on a 26h window that dedupe then
collapses. If a future source set does not fit, the number to lower is the
source row's `maxItems` — never a hang-cap, never a batch size.

A hang, empty sanitize, timeout, or 402 advances the chain:

- `raceTimeout` aborts the fetch.
- Leftover reserves a 20s floor for two fallbacks and hang-caps at 25s so
  leftover actually reaches them.
- 402 retries the same id at the affordable token cap.
- The last failure lists every attempted id.

Translate batch failures are logged as structured JSON
(`translateItems.batch_failed` with `reason` / `batchSize` / `indexes`)
and recorded on `workflow_runs.stats.steps`, but still skip the batch so a
bad response never fails a run. Per-item token usage is attributed and
stored in `items.llm_tokens`.

## Note on "system prompt"

There is no single runtime system prompt. Each LLM step sends its own
messages per call: the scoring rubric and TL;DR instructions are
user-message prompts, and the Vietnamese style guide (`VI_STYLE`) is sent
as a system message for translate/TL;DR calls. The ranking formula and all
hide/merge bookkeeping are plain code, not prompts.
