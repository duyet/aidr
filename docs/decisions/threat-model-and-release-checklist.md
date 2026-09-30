# Threat model and release checklist

Short, current-state notes for #147. Each row names the control and where it
is tested. "Live check" means something only a deployed environment can prove.

## Assets

- Subscriber emails and preferences (D1 `subscribers`).
- Worker secrets: AnyRouter key, Telegram bot token, Clerk secret, admin token,
  mail and GA4 credentials.
- Channel reputation: the Telegram channels and the email digest.
- Model spend (AnyRouter tokens).
- Ranking integrity: what reaches the homepage, email and Telegram.

## Untrusted inputs

Fetched feeds and pages, submitter titles and notes, reader translation
suggestions, `Host`/`Origin` headers, public API query strings, Clerk webhook
bodies, and anything a model returns.

## Threats and controls

| Area | Threat | Control | Evidence |
|------|--------|---------|----------|
| SSRF | Feed or submission URL points at internal hosts, metadata endpoints or redirects there | Fetch boundary with URL checks and redaction in logs | `worker/enrich.ts`, `fetch-boundary.test.ts`, `enrich-hostname.test.ts` |
| Prompt injection | Story text or reader input steers a model (rank, verdict, translation, dedupe, topics) | Untrusted text is JSON-encoded, fenced where prompts use fences, and model output is clamped and validated: dedupe keeps only known cluster ids, topic mapping only known topics. A guard test lists every file that calls the model | `prompt-injection.test.ts` |
| Prompt injection (residual) | Score, translate and TL;DR prompts carry no "this is data" sentence, only JSON encoding | Output clamping and known-id checks limit the effect: a score cannot leave 0..1 or 0..10, bullets can only cite known item ids. Adding an explicit data-only instruction changes ranking prompts, so it needs a scoring review (see `apps/web/ALGORITHM.md`) | `llm.test.ts`, `prompt-injection.test.ts` |
| Authz | Admin or MCP endpoints reached without credentials | Admin token and Clerk checks, admin rate limit, audit log (0015) | `admin.test.ts`, `admin-clerk.test.ts`, `admin-rate-limit.test.ts` |
| Authz | Clerk proxy forwards the secret to a foreign origin | Target path confinement | `clerk-proxy.test.ts` (#150) |
| Rate limits | Submission or suggestion spam; admin brute force | Per-user pending caps, rate-limit messages, admin limiter | `submissions.test.ts`, `suggestions.test.ts`, `rate-limit.test.ts` |
| Rate limits (live) | `/__clerk/*` has no zone rule | Zone-level rule needed; owner must approve the timing and threshold | Live check, not in CI |
| CORS | Wrong origins read private routes | CORS only on the public read API paths | `public-cors.test.ts`, `cors.test.ts` |
| Cache | One locale or a private page served from a shared cache | Locale and cache isolation, route indexability and cache policy | #163, #151; live header check |
| Secrets | Token committed or logged | Secret scan in CI, secret-safe telemetry, log redaction | `.github/workflows/secret-scan.yml`, `telemetry-safe.test.ts`, `llm.test.ts` |
| Telegram abuse | Runaway posting, duplicate digests, oversized media | Daily trending cap, one post per run, min gap, attempt cap, album and video limits, video probe cap | `call-caps.test.ts`, `notify*.test.ts`, `telegram-iv.test.ts` |
| Model spend | Fan-out per run | Batch sizes, attempt caps, slice budgets; per-run call bounds for score, translate, TL;DR, submission and suggestion review, translation QA, JEV panel, dedupe and topics | `call-caps.test.ts`, `llm.test.ts` |
| Data loss | Bad migration | Order and ledger gates, per-migration tests, rollback notes | `migration-gate-set.test.ts`, `migration-rollback-notes.test.ts` (every migration needs an entry in `migration-rollback.md`) |

## Out of scope for now

Denial of service beyond Cloudflare defaults, compromise of the Cloudflare
account, and model-provider outages beyond the fallbacks already coded.

## Release checklist

Run before a deploy. Tick each line with evidence (a PR comment or run link).

1. `pnpm run lint`, `pnpm run test`, `pnpm run check-types` are green on the
   merge commit.
2. Secret scan is green on the PR and on master.
3. `pnpm --filter @aidr/web check:migrations` passes. If a migration is new:
   its rollback note exists in `migration-rollback.md` (a test fails without
   it), and it applies from an empty database in CI.
4. Any change to a prompt, ranking or notify path: read
   `apps/web/ALGORITHM.md`, and `prompt-injection.test.ts` and
   `call-caps.test.ts` still pass. A new LLM call site gets a case in both.
5. Any new secret or binding is in `wrangler.toml` or `pnpm sync-env`, not in
   the repo.
6. Deploy with `pnpm --filter @aidr/web deploy` (not `cf migrate`, which drops
   Workflow and Durable Object bindings).
7. After deploy: `.cursor/skills/verify-aidr/bin/verify-aidr doctor`, then
   `GET /api/health`, and one hourly run reaching email and Telegram.
8. Live checks that CI cannot do: public and private route headers and
   redirects, locale caching, `/__clerk/*` rate-limit rule present and read
   back.
9. Rollback path known: previous Worker version, and the note for any new
   migration.

## Feature evidence

One row per shipped roadmap feature. "Not recorded" means nothing in the repo
proves it; it is not a claim that the check failed. Live results are in the
section below and were taken on 2026-09-30.

| Feature | Tests | Metrics and logs | Rollback path | Manual or live evidence |
|---------|-------|------------------|---------------|-------------------------|
| Public Markdown and agent surface (#149) | `worker/__tests__/public-cors.test.ts`, `mcp-public.test.ts`, `mcp-public.integration.test.ts`; `src/lib/llms-txt.test.ts`, `server-discovery.test.ts`, `webmcp.test.ts` | Latency budget checked daily by `live-budget.yml` ([performance-budgets.md](performance-budgets.md)) | Redeploy the previous Worker; no migration | Live check results: story Markdown, `/llms.txt`, `/api/public` |
| Feed freshness (#148) | `src/lib/feed-freshness.test.ts` | Not recorded | Redeploy the previous Worker; no migration | Not recorded |
| Clerk proxy (#150) | `worker/__tests__/clerk-proxy.test.ts` | Not recorded | Redeploy the previous Worker | Live check results: authority-style paths return 400. Zone rate-limit rule not applied (open item below) |
| Indexability (#151) | `src/lib/route-indexability.test.ts`, `homepage-headers.test.ts`, `not-found-status.test.ts` | Not recorded | Redeploy the previous Worker; no migration | Live check results: robots and cache headers on public and private routes |
| Media manifest (#160, #208) | `worker/__tests__/media.test.ts`, `media-schema.test.ts`, `migration-0024.test.ts` | Fetch and probe counts capped in `call-caps.test.ts`; wall time not recorded | Redeploy the previous Worker; the column stays (`migration-rollback.md`, 0024) | Story page with media in the live budget run |
| Telegram video and albums (#287) | `worker/__tests__/notify-video.test.ts`, `notify-delivery.test.ts`, `call-caps.test.ts` (album and video caps) | `notifications` table (0014), `owner-alerts.test.ts` for failure alerts | Redeploy the previous Worker; keep `notifications` so nothing posts twice | Live Telegram smoke not recorded (open item below) |
| Locale URLs (#163) | `src/lib/locale-routing.test.ts`, `locale-response.test.ts`, `src/routes/-api-locale.test.ts`, `src/server-locale.test.ts` | Not recorded | Redeploy the previous Worker; no migration | Live check results: locale URLs and cache isolation |
| JEV panel (#292, #295) | `worker/__tests__/jev-panel.test.ts`, `jev-score-review.test.ts`, `jev-panel-callsites.test.ts`, `jev-panel-fixtures.test.ts`, `prompt-injection.test.ts`, `call-caps.test.ts` | `jev_panel_verdicts` audit table (0031), `llm_calls` rows (0013, 0025), log line `jev panel enabled` | Unset `JEV_PANEL_ENABLED`; redeploy the previous Worker; table note in `migration-rollback.md` (0031) | Not recorded |
| Translation QA | `worker/__tests__/translation-qa.test.ts`, `translation-qa.integration.test.ts`, `translation-review-queue.test.ts`, `translation-review-queue.integration.test.ts`, `migration-0023.test.ts`, `migration-0023-upgrade.test.ts` | `translation_review_*` tables, run stats (0012) | Redeploy the previous Worker; the triggers stay live (`migration-rollback.md`, 0023) | Not recorded |
| Submissions and suggestions | `worker/__tests__/submissions.test.ts`, `suggestions.test.ts`, `rate-limit.test.ts`, `prompt-injection.test.ts`, `call-caps.test.ts` | `llm_calls` rows with task `review` | Redeploy the previous Worker; tables hold reader input, keep them (`migration-rollback.md`, 0007, 0008) | Not recorded |

## Live check results, 2026-09-30

Run with `curl -D -` against https://aidr.today on the deployed master (item 8 above). Latency budgets are in [performance-budgets.md](performance-budgets.md).

| Check | Result |
|-------|--------|
| Public locale URLs (`/?lang=en`, `/?lang=vi`, `/<id>?lang=en`, `/<id>?lang=vi`) | 200, `Content-Language` matches `lang`, `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`, `X-Robots-Tag: index, follow`. Second request is `HIT`. |
| Locale isolation | `?lang=en` and `?lang=vi` are separate cache entries (one `MISS` while the other was `HIT`). Bare `/` and `/<id>` (no `lang`) are `private, no-store`, `BYPASS`, `Vary: cookie, accept-language`, so no locale is shared from cache. |
| Legacy `?locale=vi` | 307 to `/?lang=vi`, `noindex, nofollow`, `no-store`. |
| Bad locale `/?lang=xx` | 400, `no-store`, `noindex, nofollow`. |
| Story Markdown `/api/story/<id>.md` | 200 `text/markdown`, `Access-Control-Allow-Origin: *`, `X-Content-Type-Options: nosniff`, canonical `Link`, `noindex, follow`, `s-maxage=600`. HEAD returns 200 with `content-length`. OPTIONS returns 204 with GET/HEAD/OPTIONS only. Unknown id returns 404 `no-store`. |
| `/api/public`, `/api/subscribe/preview`, `/llms.txt`, `/sitemap.xml` | 200, cached at the edge (`HIT`), `/api/*` `noindex, follow`. |
| Private routes | `/subscribe` 200 `no-store`; `/admin` 404 `no-store`, `noindex, nofollow`; `/api/admin/stats` 401 `no-store`; `/api/health` 200 `no-store`, `noindex`; `/api/nope` and unknown pages 404 `no-store`, `noindex, nofollow`. All have `Referrer-Policy: no-referrer` except public pages (`strict-origin-when-cross-origin`). |
| Redirects | `http://aidr.today/` returns 301 to `https://aidr.today/`. `www.aidr.today` does not resolve, so there is no `www` redirect to test. |
| `/__clerk/*` | `GET /__clerk/v1/client` 200 `no-store`, `noindex, nofollow`. Authority-style paths (`/__clerk/%2F%2Fevil.example/x`, `/__clerk//evil.example/x`) return 400 (the #150 confinement holds live). |
| `/__clerk/*` rate-limit rule | Not present (see below). Still open. |

Observations, not changed here:

- `/api/public` GET with a foreign `Origin` returns no `Access-Control-Allow-Origin`, and OPTIONS returns 204 with only `Vary: Origin`. `/api/story/<id>.md` sends `*`. If browser agents should read `/api/public` cross-origin, that is a gap; if not, it is as intended. Check `public-cors.test.ts` for the intended list.
- `POST /api/subscribe/preview` returns 200 HTML instead of 405. It reads only public data, so this is low risk.

## Open items that need the owner

None of these can be done or proved from the repo.

1. **Clerk proxy rate limit.** The zone rule for `/__clerk/*` is still not
   applied. The owner picks the timing and threshold (see the proposed rule
   below), creates it, and reads it back. Do not treat #150 as fully shipped
   until then.
2. **Required status checks.** Branch protection on `master` should require
   the CI jobs (`lint`, `test`, `check-types`, validate, secret scan). This is
   a GitHub setting; it is not recorded whether it is on.
3. **Live `/subscribe` browser metrics.** LCP, INP, CLS and request counts
   from a real browser against production are not recorded. Budgets are in
   [subscribe-preview-performance-budget.md](subscribe-preview-performance-budget.md).
4. **Live Telegram smoke.** One real post with a photo album and one with a
   video, on the live channels, is not recorded. Manual checklist:
   [telegram-instant-view.md](telegram-instant-view.md).

## Proposed rule: Clerk proxy rate limit

Not applied. The zone rule needs the owner, and the Free-plan limits below shape the numbers. Read it back after creating it (`GET /zones/<zone_id>/rulesets/phases/http_ratelimit/entrypoint`).

Assumptions to confirm: the zone is on the Free plan (one rate-limit rule, 10 s counting period, 10 s block, counted per IP). Clerk's frontend API makes a small burst per page load (client, environment, session touch, tokens), so a single visitor should stay far below 40 requests per 10 s. Tune with the Security Events log after a week.

```json
{
  "description": "Rate limit Clerk proxy (#147, #150)",
  "expression": "(starts_with(http.request.uri.path, \"/__clerk/\"))",
  "action": "block",
  "ratelimit": {
    "characteristics": ["ip.src"],
    "period": 10,
    "requests_per_period": 40,
    "mitigation_timeout": 10
  }
}
```

If the zone is not on Free, use `"period": 60`, `"requests_per_period": 120` and `"mitigation_timeout": 60`, matching `apps/web/worker/README.md`.
