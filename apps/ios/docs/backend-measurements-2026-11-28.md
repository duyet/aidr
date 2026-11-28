# Backend measurements, 2026-11-28

Taken against https://aidr.today with `curl` from a Linux host at about 12:20 UTC. The route code was read in `apps/web/src/routes/api/*` and `apps/web/src/lib/*`. Nothing in the web app was changed.

## Headers (selected, no cookies, no `Accept-Language`)

| Request | Status | cache-control | etag | vary | cf-cache-status | Bytes |
|---|---|---|---|---|---|---|
| `GET /api/feed?days=3` | 200 | `private, no-store` | `W/"9631d7…"` | `Cookie, Accept-Language` | BYPASS | 343,233 raw |
| `GET /api/feed?days=3&lang=vi` | 200 | `public, max-age=60, s-maxage=120, stale-while-revalidate=300` | `W/"fdbc94…"` | none | MISS | 343,233 raw |
| `GET /api/feed?days=3&lang=en` with `If-None-Match` | 304 | same as above | same tag | none | HIT | 0 |
| `GET /api/feed?days=3&lang=en`, `Accept-Encoding: br` | 200 | same | `W/"d86698…"` | none | HIT | 106,346 br |
| `GET /api/feed?days=1&lang=en` | 200 | same | | none | MISS | 25,111 zstd |
| `GET /api/feed?days=7&lang=en` | 200 | same | | none | MISS | 277,323 zstd |
| `GET /api/public` | 200 | `private, no-store` | `W/"1b7f14…"` | `Cookie, Accept-Language, Origin` | BYPASS | 29,026 raw |
| `GET /api/public?lang=en` | 200 | `public, max-age=120, s-maxage=300, stale-while-revalidate=600` | `W/"9973c2…"` | `Origin` | MISS then HIT | 9,815 zstd |
| `GET /api/story/:id` | 200 | `private, no-store` | none | `Cookie, Accept-Language, Origin` | BYPASS | 1,577 |
| `GET /api/story/:id?lang=vi` | 200 | `public, max-age=300, s-maxage=600, stale-while-revalidate=3600` | none | `Origin` | MISS | 1,577 |
| `GET /api/week/2026-W47` | 200 | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` | none | none | MISS | 12,541 |
| `GET /api/feed/freshness` | 200 | `public, max-age=60, s-maxage=120` | none | none | HIT, age 22 | 164 |
| `GET /api/thumb/:id` (no `u`) | 404 | `private, no-store` | | | BYPASS | 21 |
| `GET /api/thumb/:id?u=<image_url>` (2 samples) | 302 | `public, max-age=300` | | | HIT | 0, `Location` = publisher image |

Freshness body at the time: `{"lastFetchedAt":1795865106,"latestRun":{"id":"7b46f670-161e-4021-b37d-9c850828bdb7","startedAt":1795866881,"finishedAt":1795866956,"failed":false,"degraded":true}}`. Host clock 1795868472: the run finished 25 min earlier, the newest item was 56 min old.

## Why the default ETag never matches

`apps/web/src/lib/feed-queries.ts:585` sets `updatedAt: Date.now()` in the feed body, and `withEtag` hashes the body. Two default-URL calls a second apart gave `W/"3ccc00…"` and `W/"3b686d…"`. With `lang=en` and `lang=vi`, the bodies differ only in `lang` and `updatedAt` (diffed after parsing). `/api/story/:id` bodies differ only in `permalink`. `/api/public` bodies differ in `stories` (localized fields) and `updatedAt`. `updatedAt` is in milliseconds; `lastFetchedAt` is in seconds.

The explicit-lang switch is `localeCacheControl` in `apps/web/src/lib/locale-url.ts`: public only when the query has exactly one valid `lang` and no legacy `locale`.

## Content sizes in the 3 day feed

153 items, 130 with `image_url`, 20+ publisher hosts (marktechpost.com, pbs.twimg.com, marketbrief.now, the-decoder.com, images.ft.com, assets.bwbx.io, images.wsj.net, opengraph.githubassets.com and others). The first digest bullet and item sample images are link-preview cards with the headline baked in.

## Reproduce

```sh
curl -sS -D - -o /dev/null 'https://aidr.today/api/feed?days=3&lang=en'
curl -sS -D - -o /dev/null -H 'If-None-Match: <etag from above>' 'https://aidr.today/api/feed?days=3&lang=en'
curl -s 'https://aidr.today/api/feed/freshness'
```
