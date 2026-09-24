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

Prompts live in `worker/llm.ts`; the pipeline steps in `worker/workflow.ts`.

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
- `run()` still upserts at start **before** `pruneLlmCalls` / fetch / LLM.
  Do not wrap `open-run` in `safeStep`.
- Score and TL;DR hang-cap per model at 70s/90s (translate stays 25s).
- Do not treat GitHub Actions SUCCESS as a finished ingest. Poll
  `GET /api/system` (no-store) until `lastRun.id` matches the POST `id`
  (or at least is no longer the previous id) and `runsToday > 0`.
- Do not invent a `:05/:20/:35/:50` schedule fire.

## Pipeline (per hourly run)

1. **Fetch** — each enabled source row (`sources` table) maps to an adapter
   (`worker/sources/registry.ts`): HN via Algolia (AI-keyword pre-filter),
   HuggingNews via its `__data.json` (+ per-story detail for body/sources),
   Lobsters via `/t/{tag}.json` (`ai` / `ml` / `vibecoding` by default),
   generic RSS (`openai`, `google-ai`, `hf-blog` feeds), Anthropic Newsroom
   HTML (`/news` listing — no official RSS), xAI News via sitemap
   (`https://x.ai/sitemap.xml` `/news/<slug>` locs + `/news` listing titles),
   MarketBrief AI hub via `/{topic}/__data.json` (default topic `ai`;
   war/politics stay out). Extra RSS: `deepmind`, `aws-ml`, `google-dev`.

2. **Dedupe** — item id = `sha256(url)`; ids already in `items` are dropped.

3. **Enrich** — missing summary/thumbnail filled from the article page
   (`og:description` / `og:image`), capped and failure-proof
   (`worker/enrich.ts`). HTML entities in `og:image` (including
   double-escaped `&amp;` in query strings) are decoded before the URL is
   stored, so thumbs are real article images rather than a broken-src
   fallback.

4. **Score (Jev, then LLM)** — batches of 5.

   - TypeSafe Jev (`typesafe/jev`, `POST /api/v1/systemone`) judges each
     item first: relevance is P(AI/tech), importance and quality are 0–10
     score levels, category is one choice from the fixed 11-value enum,
     plus one entity tag and one theme tag (`none` is dropped).
   - Jev does not emit a free-form tag list.
   - Any item it misses (no key, non-2xx, or incomplete answers) falls
     through to the chat rubric on the same fields, which still writes
     3–6 free-form `tags`.
   - Do not put `typesafe/jev` on `ANYROUTER_MODEL` — chat completions
     reject it.
   - **Hide rule:** `relevance < 0.4` → status `rejected` (never shown).
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
   - The strict `translation-semantic-v2` JSON verdict scores fidelity,
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
     policy, and model fingerprints are part of idempotency. Cross-run failures
     use exponential backoff and become terminal `human_review` after three
     attempts.
   - One run makes at most 6 logical reviewer/generator calls, has a 210-second
     wall budget, and allows two model attempts per logical call. Workflow
     retries remain zero. Authenticated operators resolve the queue through
     `GET /api/admin/translation-reviews` and
     `POST /api/admin/translation-reviews/:attemptId/resolve`; actor, action,
     time, and note are persisted.
   - `pnpm run verify:translation-schema` is a read-only migration gate run by
     `pnpm run deploy`. A pre-0023/0025 database fails before pending-row
     queries; it is never reported as zero pending. Apply migrations in order
     and verify the remote schema before deployment; do not apply them from the
     QA worker.

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
   the sole primary store.

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
    stories, default 5) to confirmed subscribers, once per local morning.

12. **Notify (`worker/notify/`)** — pluggable channel adapters (Telegram
    plus optional JSON/Slack webhook via `NOTIFY_WEBHOOK_URL`),
    deliberately non-spammy.

    - A normalized `AlertEvent` (severity, source, title, summary, metrics,
      links, optional health snapshot) is the internal shape. Adapters in
      `worker/notify/adapters.ts` render Telegram HTML, Slack
      incoming-webhook JSON, or raw JSON.
    - *Daily digest*: ONE message per local day (Asia/Ho_Chi_Minh, from
      08:00) — the TL;DR snapshot's bullets (VI preferred), each linked to
      its story permalink, plus a site button.
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
      the `notifications` table; links carry `utm_source=telegram`.

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
- `minimax/m3`

TL;DR is that chat chain without Jev. Translate leads with hosted
`google/gemini-3.5-flash` (native Google route on AnyRouter), then the
same fallbacks.

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
