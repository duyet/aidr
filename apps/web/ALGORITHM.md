# aidr.today — Feed Algorithm

How each `NewsIngestWorkflow` run turns raw sources into the ranked,
bilingual feed.

- [Overview](#overview)
- [Scheduling & coalesce](#scheduling--coalesce)
- [Audience metrics (GA4 snapshot)](#audience-metrics-ga4-snapshot)
- [Ingest HTTP / D1 contract](#ingest-http--d1-contract)
- [Dry runs, reruns and previews (admin / MCP)](#dry-runs-reruns-and-previews-admin--mcp)
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

An empty `bullets_vi` or `bullets_en` means that language is not ready. The channel skips and the next run retries. Email is not a `Notifier`: a notifier is one target plus a trending post.

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

The `/data` **Audience** tab shows page views, DAU, MAU, and the subscriber
breakdowns. Traffic comes from GA4; subscribers come from D1. They are never
mixed.

- **GA4 is pulled, never read live.** The browser's GA4 events are not
  readable by the Worker, so `worker/ga4/insights.ts` signs a read-only
  service-account assertion and runs four `properties.runReport` calls: a
  90-day `date` series, a dimension-less 28-day totals row, top `pagePath`,
  and top `sessionSource`. The result is stored as one row in `ga4_insights`
  (migration 0028) and served by `GET /api/system/audience`. A page load
  never calls Google.
- **The sync rides the ingest alarm.** `NewsIngestScheduler.alarm()` calls
  `maybeSyncGa4Insights` behind a 24-hour gate, because the account cannot
  spend Worker cron slots and GA4 does not resolve finer than a day. It is
  best-effort: a failed audience sync never fails the ingest alarm.
  `POST /api/admin/ga4-sync` forces one.
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
  `tldr-preview`: same items, LLM and fallbacks as `ensureDailyTldr`, no
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
  skip dry-run rows (`NOT_DRY_RUN_SQL`). `sourceHealth` is only stored when
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

Local CLI: `pnpm --filter @aidr/web agent <audit|ranking|tldr-preview|run|rerun>`
(`apps/web/scripts/aidr-agent.ts`). `run` / `rerun` are dry unless `--live`.

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
minutes. Without `?lang=` the response is private, like story pages.

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
- Owner alerts (`worker/owner-alerts.ts`, same durable step, both optional):
  `TELEGRAM_OWNER_CHAT_ID` DMs each freshly fired alert (same 6h cooldown)
  with evidence and the run link, plus one daily summary in the first run
  between 09–12h local (`daily-summary:<date>` in `stats.alerts` makes it
  once per day). `GITHUB_ALERT_TOKEN` (fine-grained PAT, Issues read/write)
  files `aidr-alert` issues: LLM keys → `duyet/anyrouter`, others →
  `duyet/aidr`. An open issue with the same fingerprint gets a comment at
  most once per 24h instead; max 3 GitHub writes per run. Errors are logged
  and sent to Sentry, never fail the step.
- Daily video watchdog (`worker/day-video-watchdog.ts`, same step): during
  20–23h local it confirms the day's English video against each record:
  `day_videos.youtube_id` and `short_id`, a Page Reel whose caption mentions
  `aidr.today/date/<date>` (Graph, the Worker's Page token), and a
  `daily-reel.yml` run of that local date whose `Telegram` step succeeded
  (GitHub API with `GITHUB_ALERT_TOKEN`, which then also needs Actions:
  read; unset, it calls GitHub without a token from shared Cloudflare IPs).
  Anything unconfirmed, a failed lookup included, raises
  `day-video-missing` once a day, with the rerun command
  (`gh workflow run daily-reel.yml -f dry_run=false -f date=<date>`).
- `run()` still upserts at start **before** `pruneLlmCalls` / fetch / LLM.
  Do not wrap `open-run` in `safeStep`.
- Per-model caps in `worker/llm.ts`: score `SCORE_SLICE_MAX_MS` 70s, TL;DR
  `TLDR_SLICE_MAX_MS` 135s, translate first token `TRANSLATE_FIRST_TOKEN_MS`
  35s.
- Do not treat GitHub Actions SUCCESS as a finished ingest. Poll
  `GET /api/system` (no-store) until `lastRun.id` matches the POST `id`
  (or at least is no longer the previous id) and `runsToday > 0`.
- Do not invent a `:05/:20/:35/:50` schedule fire.

## Pipeline (per ingest run)

### 1. Fetch

Each enabled source row (`sources` table) maps to an adapter
(`worker/sources/registry.ts`): HN via Algolia (AI-keyword pre-filter; `popularMinPoints` adds a
points-range search),
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
and miss the others. An operator can also add or enable an `rss` row at
runtime through `upsert_source` with no deploy — see
[`worker/README.md`](worker/README.md) → "Add a source without a deploy".

- **Flood gate.** A high-volume feed is cut before the scorer sees it, in
  this order: an optional named title pre-filter (`keywordFilter: "ai"`,
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
- **Feed share cap.** The flood gate only bounds new rows, and a source
  that omits `maxItems` can still dominate the served feed. `marketbrief`
  is already capped at 6 by the flood gate. `getFeed`
  (`src/lib/feed-queries.ts`, `capSourceShare`) therefore also keeps each
  source family's top-`rank_score` rows so none exceeds 25% of the served
  feed (skipped below 4 distinct families; family as in the top-list cap
  below, so the mirrored aggregators share one 25%). It runs at read time, so historic
  rows are covered.
- **Top-list family cap.** The short ranked lists — homepage top stories
  (`PUBLIC_STORY_LIMIT`), the TL;DR's 16 and the trending pick — go
  through `pickDiverse` (`worker/source-diversity.ts`): at most
  `ceil(0.3 × list size)` rows per source *family* (8 → 3, 16 → 5). A
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

- **arXiv has no og:image.** When an item is an `arxiv.org/abs/<id>` page
  and the merged manifest still has no image, enrich fetches
  `arxiv.org/html/<id>` (same safe fetch, timeout, and a 400 KB read cap)
  and takes the first `<img>` whose `src` starts with `<id>v<n>/`, resolved
  against the final URL. A paper without an HTML version stays imageless.

- **Media identity is the URL, not the content.** Duplicates are found by
  `mediaIdentityKey` and collapse to one asset, in one manifest, across
  sources, and when a cluster merges (`mergeMediaManifests`). Rules: http and
  https of a host are one identity; tracking query keys (`utm_*`, `fbclid`,
  `ref`, ...) and CDN resize keys (`w`, `h`, `q`, `fit`, `auto`, ...) are
  ignored; image extension and size suffixes are ignored (WordPress
  `-1024x576` and `-scaled`, `.large`, `-resize-640`); a Jetpack Photon URL
  (`i0.wp.com/<host>/<path>`) equals its origin file; an image equal to a
  video's poster is dropped (the video shows it). Signed-CDN query keys and
  any other query stay part of the identity, so distinct files stay distinct.
  The story dialog applies the same keys to stored manifests, so no asset
  renders twice. No media is downloaded or hashed: two different URLs that
  serve the same bytes (a mirror, a renamed copy) stay two assets.
- **Avatars are not story images.** `isGenericImageUrl` rejects a
  filename that is a logo/icon/avatar/placeholder, any `avatar`, `avatars`,
  or `profile_images` directory before the filename, and `pbs.twimg.com`
  `/profile_images/` and `/profile_banners/` paths. `pbs.twimg.com/media/…`
  tweet photos stay.
- **Generated share cards are a fallback only.** An image whose path is an
  OG generator (`/og/…`, `/api/og`, `og-image`/`og-card` file names, see
  `isGeneratedOgCard`) is dropped from a manifest, including merged
  cluster manifests, whenever any other image or video remains. The story
  dialog applies the same rule to stored manifests at render time.
- **A video poster is only URL-checked here.** At collection time the
  poster URL passes the same URL policy as any image and nothing is
  fetched. Its bytes are checked later, at Telegram send time (see Notify).

### 4. Score (decision router, then Jev, then LLM)

Batches of 5.

- `ANYROUTER_DECISION_MODEL` (`anyrouter/decision`, `POST /api/v1/systemone`)
  judges each item first, with the same questions as Jev and a 15s cap.
  It is a System One router: it forwards to TypeSafe Jev when the BYOK
  key is healthy and to Fastino GLiNER when it is not. An answer is used
  only if the response's served `model` is Jev (`jev-*`) on a TypeSafe
  provider (`anyrouter_metadata.upstream.provider`); anything else is a
  miss, because GLiNER's levels are not calibrated. `llm_calls` records
  the served model in `route` and `provider`. Empty var → score starts at Jev.
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
- Emerging entity/model names that clear a frequency/growth bar promote
  into `learned_keywords` for title highlight and growth-boosted
  homepage trending chips (`worker/topic-learning.ts`).
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
- A deterministic title-similarity pass (normalized headlines / high
  token overlap, including short-headline-inside-long) runs alongside
  so same-story URLs the model misses still collapse.
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

Right after generation, `worker/translation-draft-check.ts` runs a
deterministic check against the exact (stripped, clipped) source the model
saw: missing keep-English jargon, active `translation_knowledge` bad phrases
(counted per occurrence, so one kept "agent" does not excuse an "đại lý";
each non-AI "FBI agents" licenses one "đặc vụ"), wrong magnitude words
("$20B" → "20 triệu"), a Title Case Vietnamese title, and a summary under
0.6× the source length (sources ≥ 200 chars). Flagged items in a batch get
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
  headers) is stripped before every guard.
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

### 8. Write

D1 upserts (`worker/d1-bind.ts` guards every bind). D1 is
the sole primary store. Migration `0024_item_media_manifest.sql` adds the
bounded JSON manifest; `image_url` remains the compatibility field.

### 9. Backfill

Up to 15 older published items missing summary or
score/tags, and up to 45 missing Vietnamese titles, get
re-fetched/scored/translated per run until the backlog drains.
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
  rank (not ICT calendar-day-so-far), after the top-list family cap → up to 16 EN bullets + 16
  independently-restated VI bullets, each linked to its `item_id`.
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
  prose).
- If the LLM digest is useful in count but `bullets_vi` has no
  Vietnamese diacritics and `title_vi` exists, keep the EN bullets and
  replace VI with the `title_vi` fallback — never persist raw English
  titles as `bullets_vi` once translations exist.
- Empty results are never persisted.
- The homepage also synthesizes a last-24h title-fallback at read time
  when the stored snapshot is thin *or* English-only in VI while
  `title_vi` exists, and persists it so the frozen EN copy cannot
  return.
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
other language's day page. Next comes the day's video for that language
(`day_videos`, `youtube_id` then `short_id`, no fallback across languages;
the block is left out when there is none). Then the lead story (large image
that is never a generated OG card, category · source, headline, summary),
then compact rows (number, category · source, linked headline, one
sentence, 84px thumbnail). After the rows: one "See all" button, the
channel strip (Telegram, YouTube, Chrome extension) and the footer (view in
browser, settings, unsubscribe, how we rank, "Forwarded this?", and
`MAIL_POSTAL_ADDRESS` when set). The headline is `items.title` or
`title_vi` for that language only; without it, the bullet's first sentence.
Every link carries `utm_content` for its position (`lead`, `s2`…, `cta`,
`video`, `channel-*`). After the button, a "Was today's edition useful?" row links to `GET /feedback?d=&l=&v=1|0&t=<token>`. That stores one vote per subscriber and date in `email_feedback` (0054); the last click wins. Counts are at `GET /api/admin/mail/feedback` and in `aidr-agent audit`. Layouts: `design` (lead image plus thumbnails),
`large` (an image per story), `no-images`, `text`. Admin preview:
`GET /api/admin/mail/preview?date=&lang=&format=`.

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
range in the header, the intro paragraph, no video and no per-day feedback
row. A title-only `fallback` digest waits until 13:00 local for the LLM
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
  when one exists. The card is the link preview, large and above the text:
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
  (`channelCopy`) and must pass the trending postability gate; a day with no
  card stories has no highlight. It is keyed `digest:<date>:top` in
  `notifications`, claimed like every send, and runs only when that day's
  digest row is `sent`, in the same run or within `HIGHLIGHT_WINDOW_MS`
  (3h) of it: an `ambiguous` or `sending` digest never triggers it, and an
  older digest (sent by a previous deploy) gets no late highlight. A
  definite failure (or no postable top story) retries on later runs up to
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
    (`dedup:canonical`), or when its event key matches (`dedup:event`):
    source-title token Jaccard of at least 0.2 with at least 3 shared tokens
    (`significantTitleTokens`, the merge step's tokenizer) and at least two
    shared named entities (names from `extractProtectedTerms`, plus a short
    org list, minus filler like "AI"; a name found in either title counts
    once the other title contains it, because a Title Case headline hides its
    own names from the extractor). 0.2 sits between the 2026-10-08..11
    audit's same-event pairs (0.21 Nvidia/Reflection across outlets, 0.35
    TypeSafe) and its different-story pairs sharing an entity (0.03 to
    0.10). Two shared names and three shared tokens are there because the
    ratio alone matches different deals by one company: "Nvidia signs AI chip
    deal with Saudi Arabia's Humain" vs "Nvidia Negotiates $25B Reflection AI
    Deal" scores 0.23 on Nvidia, AI and "deal", and short pairs like "Nvidia
    launches Rubin GPU" / "Nvidia stock falls on Rubin delay" clear 0.2 on two
    words. No LLM call.
  - **Not in v1**: a repost for a material update (a changed number, a new
    development) is never allowed, because telling an update from a rewrite
    needs more than a title compare and a wrong "update" is a duplicate post.
    Two stories about one event with no shared title words ("OpenAI defends
    firing three safety researchers" and "Fired OpenAI staff dispute
    misconduct charges", 0.09) still both post. Vietnamese-source titles
    (VnExpress) only match Vietnamese titles, since the key is the source
    title.
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
- Skip reasons are structured (`digest`: no_snapshot / already_sent /
  before_hour; `trending`: outside_hours / below_min_rank / budget_zero /
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
- The trending photo path attaches the **generated** first-party card
  `/api/og/{id8}.png?lang=` (1200×630) — the same `og:image` the card gate
  approves — instead of the upstream thumb, so a link preview can never be
  a 404 hotlink-hostile image. The normalized manifest thumbnail remains
  the fallback when the id cannot address a card.
- The trending post carries **one** inline button, "Read →" / "Đọc bài →",
  pointing at the aidr story permalink (`/{id8}?lang=` + UTM). It used to be
  two — "Read →" to the publisher, "AI;DR" to the permalink — which meant the
  image above (already the first-party card) and the link pointed at
  different stories. One canonical locale-stable URL for both.
- Not a `t.me/iv` wrapper: Instant View needs an editor-approved template and
  an editor-generated `rhash`, which exists only inside the operator's IV
  Editor session. Telegram's plain link preview from the page's own Open
  Graph tags is the documented fallback
  ([`docs/decisions/telegram-instant-view.md`](../../docs/decisions/telegram-instant-view.md)).
- **Telegram text always fits; nothing is cut mid-word** (`worker/notify/fit-text.ts`).
  A trending caption has 1024 visible characters; the summary gets what the
  title, meta line and album Read link leave (`storySummaryBudget`, at most
  500). In order: the channel's own summary when it fits; else a stored
  rewrite in `notify_summaries` (one LLM call at send time through
  `completeJson`, only for the story about to be posted, keyed by item and
  language, regenerated when the source summary changes; rejected unless
  non-empty, in budget, finished, no ellipsis, and in the channel's language);
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
  most 10 items, at most 40 MB of video). An over-cap album is dropped whole,
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
  `sendPhoto:<d>`, `sendPhoto(card):<d>`, `photo:none_sent`. Ambiguous and
  budget-exhausted sends keep their own error.
- **What is checked before a send.** The poster is fetched and checked
  (JPEG, at most 200 KB, at most 320 px) only when it is about to be used as
  a `sendVideo` thumbnail; a poster that fails is left out and the video
  still goes. Gallery photos (`sendPhoto`, album photos) are not
  preflighted: Telegram fetches them, and if it rejects one the post tries
  the next gallery image (at most 3 photos, in order), then the generated
  card, then text.
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
- **Media order: story image first, generated card as fallback.** The post
  leads with the story's real photo. The first-party OG card
  `/api/og/{id8}.png?lang=` is used when the story has no usable image, and
  as a one-shot retry when Telegram rejects the first 3 gallery images
  (hotlink-hostile or dead upstream URLs) — it is 200 by construction, so the post keeps its
  image instead of dropping to bare text. The card no longer occupies an
  album slot.
  The card itself (`/api/og/{id8}.png`) tries the thumbnail, then the other
  manifest images (deduped, at most 3 candidates in all), and renders
  the branded fallback only when every one fails to fetch.
  A post already sent on the card gets its real image later with
  `pnpm --filter @aidr/web telegram-swap-card` (dry unless `--apply`).
  It edits only when D1 says the card went out and the live photo is
  1200x630, tests the image in the staging chat first, and logs every
  edit to `admin_audit` as `telegram.edit_media`.
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
- `max_tokens` 8192 (2048 on translate).
- Reasoning-model fallback (extracts JSON from `message.reasoning` when
  content is starved).
- Comma-separated model fallback chains (`ANYROUTER_MODEL`).
- Skips: a 404 skips an id for 15 min and a 429 for 2 min (isolate-wide).
  Inside a run (`withLlmCallContext`), an id that times out 3 times in a
  row is skipped for the rest of that run; a served call resets the count.
- Per-task overrides (`ANYROUTER_TRANSLATE_MODEL` /
  `ANYROUTER_TLDR_MODEL`).

Score tries Jev (`typesafe/jev` via `/systemone`, 30s cap per item) first,
then this chat chain:

- `google/gemma-latest` (rolling alias, served `gemma-4-31b` on 2026-10-10)
- `z-ai/glm-latest` (rolling alias, served `glm-5.2`)
- `@preset/aidr` (workspace preset, served `gemma-4-31b` on 2026-10-10)
- `anyrouter/auto` (router safety net, always last; served Laguna)

This chain also runs the cluster call. On the gold cluster set, Laguna
scored F1 0.51, while Gemma, GLM 5.2 and the preset scored 1.0. TL;DR uses
`openai/gpt-5.6-luna`, then `google/gemini-3-flash` (`anyrouter/auto`
served 0 of 26 tldr calls over 7 days). Translate runs
`google/gemini-3-flash`, `google/gemma-latest`, Laguna, then the
`gemma-4-31b` :free route, ordered by 7-day success rate (2026-10-11). The rolling
aliases follow new models without a deploy, so re-probe what they serve
before reading a bench row as a fixed model.

TL;DR and translate use the same chain without Jev. The VI→EN generator
uses only concrete ids (`poolside/laguna-s-2.1`). The translation reviewer
(`z-ai/glm-4.6`, then `stealth/space-bunny-alpha`) shares no id with any
generator chain and gets a 45s budget (`QA_REVIEW_TIMEOUT_MS`), 30s max for
the first hop. Since ~08:40 UTC 2026-10-02 every `z-ai/*` id is BYOK-only on
this key (404 in ~2s), so reviews depend on space-bunny (1 of 3 probe pairs
inside the slice) until a Z.ai BYOK key is added; see the dated note in
`wrangler.toml`.

`@preset/aidr` heads the score, translate and TL;DR chains. It resolves to
`poolside/laguna-s-2.1`; the ids behind it stay as a fallback in case the
preset 404s or 429s again (both happened until AnyRouter fixed them on
2026-10-01).

An id that returns 404 (`model_not_found`, BYOK-only `model_unavailable`)
is skipped by later calls in the same isolate for 15 minutes, and a 429
for 2 minutes. Skipped ids take no budget slice. If every id in a chain is
skipped, the chain is tried in full. 5xx and timeouts never skip.

`parseJson` drops stray closers when a plain parse fails: Laguna often ends
with an extra `]`, or closes the root `}` before `,"bullets_vi":[...]`.
Without that, a translate batch is lost and a TL;DR keeps only
`bullets_en`, so VI falls back to titles.

Every attempt also has a first-token cutoff (`FIRST_TOKEN_MAX_MS`, 20s): a
model that streams nothing by then is logged as a timeout and the chain
moves on, so one hang cannot eat most of a batch budget. Pick chain models
with a streaming probe: production always sends `stream: true` with
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
