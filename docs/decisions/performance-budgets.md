# Performance budgets for public surfaces

Refs #147. Live latency budgets for the public agent and SEO responses, the `/subscribe` preview, and a story page with media. They come from a live run against production on 2026-09-30 (deployed master, 20 samples per row, one client, sequential requests, no warm-up).

The subscribe page's browser metrics (LCP, INP, CLS, request counts) stay in [subscribe-preview-performance-budget.md](subscribe-preview-performance-budget.md). This file covers server response time and size only.

## How the numbers were taken

`apps/web/scripts/check-live-budget.ts` fetches each URL 20 times and reports p50 and p95 of total time (request to full body). It runs each surface two ways:

- **edge**: the plain URL, normally a Cloudflare cache hit.
- **cold**: the same URL plus a unique `_budget=` query string. That is a new cache key, so the request reaches the Worker and D1. This is the worst case a crawler or agent can cause.

Run it with `pnpm --filter @aidr/web run check:live-budget -- --report` (print only) or without `--report` to fail over budget. `--origin` and `--story` override the target.

## Measurements

Two cold runs are shown because the cold path is noisy: the first run used `curl -w '%{time_total}'`, the second the script (Node `fetch`). Edge numbers were stable across runs.

| Surface | Path | Edge p50 / p95 (ms) | Cold p50 / p95, curl run (ms) | Cold p50 / p95, script run (ms) | Body |
| --- | --- | --- | --- | --- | --- |
| Subscribe preview | `/api/subscribe/preview?lang=en` | 59 / 68 (script run 1); 78 / 127 (run 2) | 849 / 2811 | 350 / 458 | 9.1 KB |
| llms.txt | `/llms.txt` | 61 / 70; 139 / 216 | 193 / 335 | 91 / 207 | 8.1 KB |
| Story Markdown | `/api/story/<id>.md?lang=en` | 60 / 95; 54 / 93 | 241 / 335 | 130 / 260 | 4.4 KB |
| Sitemap index | `/sitemap.xml` | 56 / 61; 51 / 56 | 241 / 319 | 126 / 204 | 0.7 KB |
| Public digest | `/api/public?lang=en` | 57 / 63; 53 / 62 | 359 / 473 | 254 / 367 | 15.9 KB |
| Story page with media | `/<id>?lang=en` | 65 / 77; 56 / 61 | 446 / 5208 | 158 / 242 | 55 KB |

The story used was `15523a41` (three images in its media manifest). Edge responses from `/api/public`, `llms.txt`, story Markdown and the story page all returned `cf-cache-status: HIT` for 19 or 20 of 20 samples; the first sample of a cold URL is the only `MISS`.

## Budgets

Set at roughly 3 to 5 times the worst measured p95, so network noise on a GitHub runner does not page anyone, but a real regression (an uncached path, an N+1 read, a media fan-out) does. Tighten them after a few scheduled runs show the runner's own spread.

| Surface | Edge p50 | Edge p95 | Cold p50 | Cold p95 | Max body |
| --- | --- | --- | --- | --- | --- |
| Subscribe preview | 300 ms | 1000 ms | 1500 ms | 5000 ms | 60 KB |
| llms.txt | 300 ms | 1000 ms | 500 ms | 1000 ms | 20 KB |
| Story Markdown | 300 ms | 1000 ms | 500 ms | 1000 ms | 30 KB |
| Sitemap index | 300 ms | 1000 ms | 500 ms | 1000 ms | 10 KB |
| Public digest | 300 ms | 1000 ms | 700 ms | 1500 ms | 250 KB |
| Story page with media | 400 ms | 1200 ms | 1000 ms | 8000 ms | 400 KB |

The subscribe preview body budget matches the 60 KB limit in the subscribe preview doc. The cold p95 for the preview and the story page is wide on purpose: the curl run saw 2.8 s and 5.2 s tails on a cold path, and the script run did not. That tail is the number to reduce, not to normalize.

The check also fails if a response is not `200` or the body lacks a marker string (for example `aidr-story-markdown`), so an error page cannot pass on speed.

## When it runs

`.github/workflows/live-budget.yml` runs daily at 06:17 UTC and on manual dispatch (`workflow_dispatch`, with optional `origin` and `story` inputs). It never runs on pull requests. A failure is a signal to look at the live surface, not a merge gate.

## Not covered here

- Media enrichment cost inside the hourly run (fetch and probe counts are capped in `call-caps.test.ts`; wall time per run is not measured here).
- Browser metrics for the story page (LCP, CLS). Use `pnpm --filter @aidr/web run perf:lighthouse`.
- Multi-region latency. All samples came from one client.
