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
| Prompt injection | Story text or reader input steers a model (rank, verdict, translation) | Untrusted text is JSON-encoded, fenced where prompts use fences, and model output is clamped and validated | `prompt-injection.test.ts` |
| Prompt injection (residual) | Score, translate and TL;DR prompts carry no "this is data" sentence, only JSON encoding | Output clamping and known-id checks limit the effect: a score cannot leave 0..1 or 0..10, bullets can only cite known item ids. Adding an explicit data-only instruction changes ranking prompts, so it needs a scoring review (see `apps/web/ALGORITHM.md`) | `llm.test.ts`, `prompt-injection.test.ts` |
| Authz | Admin or MCP endpoints reached without credentials | Admin token and Clerk checks, admin rate limit, audit log (0015) | `admin.test.ts`, `admin-clerk.test.ts`, `admin-rate-limit.test.ts` |
| Authz | Clerk proxy forwards the secret to a foreign origin | Target path confinement | `clerk-proxy.test.ts` (#150) |
| Rate limits | Submission or suggestion spam; admin brute force | Per-user pending caps, rate-limit messages, admin limiter | `submissions.test.ts`, `suggestions.test.ts`, `rate-limit.test.ts` |
| Rate limits (live) | `/__clerk/*` has no zone rule | Zone-level rule needed; owner must approve the timing and threshold | Live check, not in CI |
| CORS | Wrong origins read private routes | CORS only on the public read API paths | `public-cors.test.ts`, `cors.test.ts` |
| Cache | One locale or a private page served from a shared cache | Locale and cache isolation, route indexability and cache policy | #163, #151; live header check |
| Secrets | Token committed or logged | Secret scan in CI, secret-safe telemetry, log redaction | `.github/workflows/secret-scan.yml`, `telemetry-safe.test.ts`, `llm.test.ts` |
| Telegram abuse | Runaway posting, duplicate digests, oversized media | Daily trending cap, one post per run, min gap, attempt cap, album and video limits, video probe cap | `call-caps.test.ts`, `notify*.test.ts`, `telegram-iv.test.ts` |
| Model spend | Fan-out per run | Batch sizes, attempt caps, slice budgets | `call-caps.test.ts`, `llm.test.ts` |
| Data loss | Bad migration | Order and ledger gates, per-migration tests, rollback notes | `migration-gate-set.test.ts`, `migration-rollback-0027-0030.md` |

## Out of scope for now

Denial of service beyond Cloudflare defaults, compromise of the Cloudflare
account, and model-provider outages beyond the fallbacks already coded.

## Release checklist

Run before a deploy. Tick each line with evidence (a PR comment or run link).

1. `pnpm run lint`, `pnpm run test`, `pnpm run check-types` are green on the
   merge commit.
2. Secret scan is green on the PR and on master.
3. `pnpm --filter @aidr/web check:migrations` passes. If a migration is new:
   its rollback note exists, and it applies from an empty database in CI.
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
