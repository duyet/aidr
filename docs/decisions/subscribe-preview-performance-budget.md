# /subscribe preview performance budget

Refs #141. The live email preview must not slow the first paint of `/subscribe`. Numbers below are targets to check in a production-like run; the baseline and after columns stay empty until someone measures them live.

## Budget

| Metric | Mobile (slow 4G, mid phone) | Desktop | Baseline | After |
| --- | --- | --- | --- | --- |
| LCP | <= 2.5 s | <= 1.8 s | | |
| INP | <= 200 ms | <= 100 ms | | |
| CLS | <= 0.05 | <= 0.05 | | |
| `/api/subscribe/preview` latency, edge hit (p75) | <= 150 ms | <= 100 ms | | |
| `/api/subscribe/preview` latency, cache miss (p75) | <= 800 ms | <= 600 ms | | |
| Preview requests on first load, Chrome tab | 0 | 0 | | |
| Preview requests after selecting Email | 1 | 1 | | |
| Preview response size | <= 60 KB | <= 60 KB | | |

## Rules the code keeps

- The preview frame has a reserved height (`h-[560px]` on `/subscribe`, `h-96` in settings) and shows a status message until the frame loads, so a slow or failed read causes no layout shift.
- `/api/subscribe/preview` does one bounded read (latest `tldr_snapshots` row, `LIMIT 1`).
- A failed D1 read returns a 500 with `private, no-store`; it is never cached as a good preview.
- The "still preparing" page is cached for 60 s at the edge; a ready preview for 10 min with stale-while-revalidate.
- Cache keys include the full query string (`lang`, `n`, `format`), so locales and sizes stay distinct.
- Fade-in transitions are off under `prefers-reduced-motion`.

## How to measure

1. Chrome DevTools, Network tab: disable cache for cold, enable for warm. Record request count and transfer size for `/subscribe` on the Chrome, Telegram and Email tabs.
2. Lighthouse mobile and desktop, three runs each; use the median. One run is noise.
3. `curl -s -o /dev/null -w '%{time_total} %{size_download}\n' 'https://aidr.today/api/subscribe/preview?lang=en'` twice (miss, then hit); check `cf-cache-status`.
4. Repeat with a slow or empty D1 and with `prefers-reduced-motion: reduce`.

## Still open (needs a live run)

- Server-side latency baseline: see [performance-budgets.md](performance-budgets.md) (measured 2026-09-30). Browser metrics in the table above are still empty.
- Confirm the default Chrome tab makes no preview request and Email makes one.
- Record any exception to the budget with its reason.
