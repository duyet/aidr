# aidr.today — Feed Algorithm

How the hourly `NewsIngestWorkflow` turns raw sources into the ranked,
bilingual feed.

- [Overview](#overview)
- [Scheduling & coalesce](#scheduling--coalesce)
- [Ingest HTTP / D1 contract](#ingest-http--d1-contract)
- [Ops pitfalls](#ops-pitfalls)
- [Pipeline (per hourly run)](#pipeline-per-hourly-run)
- [LLM transport](#llm-transport)
- [Note on "system prompt"](#note-on-system-prompt)

## Overview

One hourly run does three jobs. Prompts live in `worker/llm.ts`; the steps live in `worker/ingest/` (one module per step), run in order by `worker/workflow.ts`.

| Phase | What it writes | Where |
| --- | --- | --- |
| Consume | Source rows become `items` (fetch, dedupe, enrich) | `worker/sources/`, `worker/dedupe.ts`, `worker/enrich.ts` |
| Rank | Scores, translations, `rank_score`, then today's `tldr_snapshots` row (`bullets_en`, `bullets_vi`) | `worker/llm.ts`, `worker/ranking.ts`, `worker/tldr.ts` |
| Publish | The same edition, per language, with no cross-language fill-in | `worker/digest/edition.ts` |

Publish has two deliveries and they do not share a clock or a table:

- **Email** (`worker/subscribe/send.ts`) — two lanes, English and Vietnamese. From 07:00 in each subscriber's timezone. Size 3/5/10 (default 5) and layout `design` or `text` come from that subscriber. Idempotency is `subscribers.last_sent_date`. A browser preview of the same render is `GET /api/subscribe/preview?lang=&n=&format=`.
- **Telegram** (`worker/notify/`) — VI (`telegram`) and EN (`telegram-en`), from 08:00 `Asia/Ho_Chi_Minh`, 8 bullets, once per channel per local date in `notifications`. Trending stories are Telegram-only.

An empty `bullets_vi` or `bullets_en` means that language is not ready. The channel skips and the next hourly run retries. Email is not a `Notifier`: a notifier is one target plus a trending post.

## Scheduling & coalesce

Hourly instances are started by the `NewsIngestScheduler` Durable Object
alarm. That is not a Worker `[triggers]` cron (Free 5-cron cap) and not
Workflow `schedules` (paid-plan).

GitHub Actions (`.github/workflows/ingest.yml`, four independent crons at
:05/:20/:35/:50) POSTs `/api/admin/ingest` as a watchdog because GitHub
routinely delays or skips scheduled workflows.

Both paths coalesce: a new instance is skipped if one started in the last
45 minutes. `POST /api/admin/ingest?force=1` (workflow_dispatch) bypasses
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

The Durable Object only gates the 45-minute coalesce and records
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

## Ops pitfalls

- LLM-heavy Workflow steps use `retries: 0` and a 4-minute timeout. A
  failed score/TL;DR call must not abort close-run.
- Just before close-run, the `health-check` step (`worker/health.ts`)
  reports to Sentry/Bugsink when: a Telegram channel has no post for >8h
  during local 09–23h, >50% of the run's LLM attempts failed (min 4), TL;DR
  failed 3 runs in a row, a step failed, or the run errored. Fired keys go
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
- `run()` still upserts at start **before** `pruneLlmCalls` / fetch / LLM.
  Do not wrap `open-run` in `safeStep`.
- Score and TL;DR hang-cap per model at 70s/90s (translate stays 25s).
- Do not treat GitHub Actions SUCCESS as a finished ingest. Poll
  `GET /api/system` (no-store) until `lastRun.id` matches the POST `id`
  (or at least is no longer the previous id) and `runsToday > 0`.
- Do not invent a `:05/:20/:35/:50` schedule fire.

## Pipeline (per hourly run)

1. **Fetch** — each enabled source row (`sources` table) maps to an adapter
   (`worker/sources/registry.ts`): HN via Algolia (AI-keyword pre-filter; `popularMinPoints` adds a
   points-range search),
   HuggingNews via its `__data.json` (+ per-story detail for body/sources),
   Lobsters via `/t/{tag}.json` (`ai` / `ml` / `vibecoding` by default; broad
   `filteredTags` such as `programming` keep only AI-keyword titles),
   generic RSS (`openai`, `google-ai`, `hf-blog` feeds), Anthropic Newsroom
   HTML (`/news` listing — no official RSS), xAI News via sitemap
   (`https://x.ai/sitemap.xml` `/news/<slug>` locs + `/news` listing titles),
   MarketBrief AI hub via `/{topic}/__data.json` (default topic `ai`;
   war/politics stay out). Extra RSS: `deepmind`, `aws-ml`, `google-dev`.

   The set of sources is **declarative**: one list in
   `worker/sources/catalog.ts` generates the runtime seed, the migration, and
   the `/api/system/sources` + `/data` surfaces, so a source cannot reach one
   and miss the others. An operator can also add or enable an `rss` row at
   runtime through `upsert_source` with no deploy — see
   [`worker/README.md`](worker/README.md) → "Add a source without a deploy".

   - **Flood gate.** A high-volume feed is cut before the scorer sees it, in
     this order: an optional named title pre-filter (`keywordFilter: "ai"`,
     the same regex HN uses), then a hard newest-first `maxItems` cap applied
     after the since-window filter. The Vietnamese newsroom and the four AI
     newsrooms are capped at 6 items per run each. Newest-first is what makes
     the cap safe: the 26h window means the head of the feed at the next run
     is exactly what was published since the last one, so the cap samples the
     live edge and dedupe drops the rest.
   - **Host pacing.** A row may set `minRequestIntervalMs` to serialise
     same-host fetches; the first request to a host is never delayed.
   - **Explicit source language.** A row with `sourceLang: "vi"` puts its
     items on the VI→EN translation-QA path below. It is declared metadata,
     never inferred from diacritics.
   - A source that returns a non-2xx, or a 200 that is really an HTML page,
     throws a typed `SourceFetchError` so the run records `fetch_failed` /
     `parse_failed` rather than reporting a quiet feed.

1b. **Per-source health + staleness** — every source row gets a record in
    `workflow_runs.stats.sourceHealth`: `fetched` / `scored` / `accepted` /
    `rejected` / `merged`, a structured skip reason (`fetch_failed`,
    `parse_failed`, `empty`, `all_rejected_below_relevance`, `disabled` — a
    closed enum, never free text or a URL), and a count of consecutive
    zero-item runs. The streak is **carried forward** from the previous run's
    stats (one single-row read) rather than recomputed from run history, so
    surfacing staleness on the read path costs nothing. A source at or over
    its threshold is flagged stale in `/api/system/sources` and the `/data`
    Algo tab: **168 consecutive runs** (7 days at the hourly cadence). That
    number is measured, not round — 14 of the 21 registry feeds returned
    nothing inside the 26h window when they were verified live, including
    pre-existing ones that publish weekly, so the "e.g. 48 runs" in #230 would
    have flagged healthy sources most of the weekend. A row may override it
    with `staleAfterRuns` when a source's real cadence demands it; arXiv is
    the known case (no weekend submissions, ~54 silent runs) and is not in
    the registry yet — see `ARXIV_NOT_ADDED_REASON` in
    `worker/sources/catalog.ts`. A disabled source is reported `disabled`,
    never `stale` — off is a decision, not a fault. This is observability
    only: it changes no ranking, no prompt, and no LLM budget.

2. **Dedupe** — item id = `sha256(url)`; ids already in `items` are dropped.

3. **Enrich** — missing summary/thumbnail filled from the article page
   (`og:description` / `og:image` / Twitter / JSON-LD / supported video
   poster fields), capped and failure-proof (`worker/enrich.ts`). The ordered,
   bounded `media_manifest` is stored alongside the legacy `image_url`; video
   posters stay nested on the video asset and are never emitted as extra image
   candidates. HTML entities in media URLs (including double-escaped `&amp;`
   in query strings) are decoded before storage, so thumbs are real article
   images rather than a broken-src fallback.

4. **Score (Jev, then LLM)** — batches of 5.

   - TypeSafe Jev (`typesafe/jev`, `POST /api/v1/systemone`) judges each
     item first: relevance is P(AI/tech), importance and quality are 0–9
     score levels, category is one choice from the fixed 10-value enum (legal
     stories use Regulation), plus one entity tag and one theme tag from fixed
     10-value enums (`none` is dropped).
   - Jev does not emit a free-form tag list.
   - Any item it misses (no key, non-2xx, or incomplete answers) falls
     through to the chat rubric on the same fields, which still writes
     3–6 free-form `tags`.
   - Do not put `typesafe/jev` on `ANYROUTER_MODEL` — chat completions
     reject it.
   - **Hide rule:** `relevance < 0.4` → status `rejected` (never shown).
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
     human override record at `POST /api/admin/jev-verdicts/<id>/override`);
     nothing reads it back into ranking. Details: `worker/jev-panel/README.md`.
   - Tags are then canonicalized (`normalizeTopics`) and captured into
     `topic_daily` each ingest (~15 min).
   - Emerging entity/model names that clear a frequency/growth bar promote
     into `learned_keywords` for title highlight and growth-boosted
     homepage trending chips (`worker/topic-learning.ts`).
   - Homepage trending prefers versioned model/product names extracted
     from headlines (e.g. GPT-6 Astra, Fable 5.1) over generic themes like
     `llm` / `agent`.
   - Chip weight is source-count (capped at 8) so a merged multi-outlet
     story outranks a single-source mention of the same name.

5. **Merge (LLM + title similarity)** — one clustering call, plus a
   deterministic pass.

   - The clustering call compares new items (title, url, source) with the
     last 72h of published titles.
   - A deterministic title-similarity pass (normalized headlines / high
     token overlap, including short-headline-inside-long) runs alongside
     so same-story URLs the model misses still collapse.
   - Same-story clusters collapse to a canonical item (existing item wins,
     else highest rank).
   - Losers get status `merged` + `duplicate_of`. Their sources and max
     points/comments fold into the canonical (`worker/dedupe.ts`).

6. **Translate (LLM)** — EN→VI in batches, journalist style (`VI_STYLE`
   system prompt: no parenthetical glosses, no calques, keep technical
   jargon in English, few-shot anchored). Every item and translation row
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
   - The strict `translation-semantic-v3` JSON verdict scores fidelity,
     naturalness, and confidence separately. Deterministic entity, number,
     date, unit, polarity, and uncertainty guards can override an optimistic
     reviewer, alongside omission, addition, and terminology checks. Prompt
     data is delimiter-escaped and output must be one exact bounded JSON object;
     prose, fences, duplicate keys, and oversized responses are rejected.
   - Accept requires no hard failure, fidelity/naturalness ≥ 0.7, and
     confidence ≥ 0.6. An EN→VI failure gets at most one generator repair and
     one independent re-review. VI→EN failures are not silently substituted;
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

   Quality limits: deterministic checks and an independent model review are
   risk controls, not a human-labeled quality score. There is no claim about
   translation accuracy, recall, or production quality until an operator-approved
   EN↔VI evaluation set and metrics are run.

7. **Rank (pure code, `worker/ranking.ts`)** — recomputed for items < 72h:

   ```text
   rank_score = importance
              × (0.6 + 0.4·quality/10)      # quality modulates ±40%
              × exp(−ageHours/36)           # freshness decay
              × (1 + log10(1 + points + 0.5·comments))  # engagement, log-damped
              × (1 + 0.12·min(sourceCount, 8))          # independent sources (corroboration)
   ```

8. **Write** — D1 upserts (`worker/d1-bind.ts` guards every bind). D1 is
   the sole primary store. Migration `0024_item_media_manifest.sql` adds the
   bounded JSON manifest; `image_url` remains the compatibility field.

9. **Backfill** — up to 15 older published items missing summary or
   score/tags, and up to 45 missing Vietnamese titles, get
   re-fetched/scored/translated per run until the backlog drains.
   Translate skips LLM only when explicit `source_lang='vi'` metadata marks a
   native source, retries leftover items one-at-a-time after a batch fail, and
   the VI UI hides the EN badge when the painted title is Vietnamese or
   `title_vi` exists.

10. **TL;DR (LLM)** — hourly.

    - Generate today's **local** snapshot (`Asia/Ho_Chi_Minh` date key —
      same identity the Telegram digest looks up for once-per-local-day
      send) if missing, thin, EN-only (`bullets_vi` empty), or
      **English-only `bullets_vi` while `title_vi` now exists**.
    - Otherwise refresh a useful bilingual snapshot when the last write is
      older than 3 hours.
    - Content is always the top 16 items of the **rolling last 24h** by
      rank (not ICT calendar-day-so-far) → up to 16 EN bullets + 16
      independently-restated VI bullets, each linked to its `item_id`.
    - Homepage thumbs and the story dialog need those ids. If the model
      pastes `[hex]` into the bullet text instead of (or besides)
      `item_ids`, parse recovers the ids and strips the citation.
    - Each bullet is a short digest (~2 sentences / 180–240 characters),
      not a headline and not a paragraph. The homepage clamps overflow to
      2 lines and sizes the thumbnail to that row.
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

11. **Email digest** — per-subscriber language and digest size (3/5/10
    stories, default 5) to confirmed subscribers, once per their local
    morning (from 07:00 in the subscriber's timezone). Copy comes from the
    same edition as Telegram (`worker/digest/edition.ts`): `bullets_vi` or
    `bullets_en` for that local date, with no cross-language fallback. An
    empty column leaves `last_sent_date` unset so the next hourly run
    retries. Idempotency stays on `subscribers.last_sent_date`, not the
    `notifications` table.

12. **Notify (`worker/notify/`)** — pluggable channel adapters (Telegram
    plus optional JSON/Slack webhook via `NOTIFY_WEBHOOK_URL`),
    deliberately non-spammy.

    - A normalized `AlertEvent` (severity, source, title, summary, metrics,
      links, optional health snapshot) is the internal shape. Adapters in
      `worker/notify/adapters.ts` render Telegram HTML, Slack
      incoming-webhook JSON, or raw JSON.
    - *Daily digest*: ONE message per local day per channel (Asia/Ho_Chi_Minh,
      from 08:00). The Vietnamese channel (`TELEGRAM_VI_CHAT_ID`, falling
      back to `TELEGRAM_CHAT_ID`) posts `bullets_vi` only. The English
      channel (`TELEGRAM_EN_CHAT_ID`, same bot token)
      posts `bullets_en` only. Neither falls back to the other language.
      Each bullet links to its story permalink, plus a site button.
    - *Trending*: an individual post only when the algo flags a story as
      exceptional (`rank_score ≥ 20` and `llm_importance ≥ 7`), capped at
      6/day with a 1h minimum gap, one per run. 20 is reachable for a
      8×8, fresh, well-engaged, multi-source story; typical single-source
      live max is lower. Digest is the intended daily Telegram post.
    - Skip reasons are structured (`digest`: no_snapshot / already_sent /
      before_hour; `trending`: below_min_rank / budget_zero /
      none_unposted) and `console.info`'d plus stored on
      `workflow_runs.stats.notifyReason`.
    - Delivery state (status/attempts/last_error, bounded retries) lives in
      the `notifications` table, keyed by channel and item/date rather than
      locale. Telegram site links use flat `/{8-char}` permalinks with explicit
      `lang=vi|en` plus `utm_source=telegram`; publisher links keep their own
      URL and receive only the Telegram attribution parameter.
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
    - `sendMessage`/`sendPhoto` set `link_preview_options` explicitly
      (`is_disabled`) rather than inheriting the API default: a preview would
      attach to one arbitrary digest bullet or double the photo. Rationale and
      the rejected `prefer_small_media`/`prefer_large_media`/`show_above_text`
      values are in `worker/notify/telegram.ts`.
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
    - A trending story with two or more images uses `sendMediaGroup` (2–10
      photos: the story's own manifest images and video posters). One image
      stays `sendPhoto` so the inline button remains — an album has no
      `reply_markup`, so that link moves into the caption.
    - **Video** (`worker/notify/video.ts`): a manifest video is preflighted with
      bounded Range requests over `fetchWithSafeRedirects` (never a full
      download): MP4 container, at most 20 MB, at most 300 s (`mvhd`, faststart
      or trailing `moov`), size and duration known. Proven video-only stories use
      `sendVideo` (with the poster as `thumbnail` only when it is a legal JPEG
      thumbnail); video plus images uses one mixed `sendMediaGroup` (primary
      video, its poster, then manifest order, deduped by `mediaIdentityKey`, at
      most 10 items, at most 40 MB of video). An over-cap album is dropped whole,
      never truncated. Any skip or Telegram error falls back to the photo path,
      then text, so nothing double-posts. Photo bytes in an album are not probed.
      Durable multi-message delivery remains a follow-up.
    - **Media order: story image first, generated card as fallback.** The post
      leads with the story's real photo. The first-party OG card
      `/api/og/{id8}.png?lang=` is used when the story has no usable image, and
      as a one-shot retry when Telegram rejects the image (hotlink-hostile or
      dead upstream URLs) — it is 200 by construction, so the post keeps its
      image instead of dropping to bare text. The card no longer occupies an
      album slot.
    - **Each channel is one language.** `telegram` is `vi` and `telegram-en`
      is `en`. Digest bullets come from that language's edition
      (`worker/digest/edition.ts`) and never from the other column. Trending
      copy is chosen by `Notifier.lang`: English posts the source title, and
      Vietnamese posts `translations` when the title is present, otherwise
      the source title. A second locale is another notifier entry.

13. **Review gates (LLM, rating ≥ 0.6)** — user translation suggestions and
    HN-style story submissions are judged (faithfulness / relevance / not
    spam; submission text is treated strictly as data, never instructions)
    before they touch the feed. Jev (`typesafe/jev`,
    `POST /api/v1/systemone`, BYOK-only via Dashboard → BYOK → TypeSafe) is
    tried first as a typed decision (`noul` intent/spam + `score` quality
    mapped to relevance/rating); any Jev failure falls back to the existing
    chat-completions JSON judge. `/api/system` lists that chat chain after
    Jev on `models.decisions`.

## LLM transport

All calls go through `callAnyrouter` (`worker/llm.ts`):

- Streaming SSE (bypasses anyrouter's queue for long prompts).
- JSON mode.
- `max_tokens` 8192 (2048 on translate).
- Reasoning-model fallback (extracts JSON from `message.reasoning` when
  content is starved).
- Comma-separated model fallback chains (`ANYROUTER_MODEL`).
- Per-task overrides (`ANYROUTER_TRANSLATE_MODEL` /
  `ANYROUTER_TLDR_MODEL`).

Score tries Jev (`typesafe/jev` via `/systemone`, 30s cap per item) first,
then this chat chain:

- `anyrouter/auto`
- `deepseek/deepseek-v4.1-flash`
- `poolside/laguna-s-2.1`

TL;DR and translate use that chat chain without Jev. The VI→EN generator
uses its concrete ids (`deepseek/deepseek-v4.1-flash`,
`poolside/laguna-s-2.1`).

`google/gemini-3.5-flash` is BYOK-only on AnyRouter and 404s for keyless
calls (anyrouter#3655). `minimax/m3` has no upstream key and returns
404/502 (anyrouter#3817). Both are out of every chain.

Hard-coded Gemma/GLM/Ling flash ids 404/502'd or are BYOK-only; do not
restore them. BYOK-only ids such as SEA-LION and Gemini 3.6/3.7/3.8 are
omitted, and stealth/ox-alpha was removed after AnyRouter delisted it.

Translate runs in batches of 3 (summaries clipped, title-only retry) and
each backfill slice is its own Workflow step so a finished batch is written
even if a later slice times out.

- Score batches of 5 with a 70s hang-cap.
- TL;DR uses a 90s hang-cap.
- Translate attempts use a 60s hang-cap so `anyrouter/auto` is not killed
  mid-route (a 25s cap made every score/TL;DR model log 0 tokens).

None of these budgets are raised by adding sources. The flood gate above is
what makes extra coverage fit inside them: `scoreItems` runs 3 concurrent
batches of 5 (15 items) inside a 4-minute step, and the measured steady state
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
