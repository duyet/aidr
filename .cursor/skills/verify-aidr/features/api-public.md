# Public API

`GET /api/public` is the unauthenticated digest for the site, the Chrome new-tab extension, and other clients. It returns slim JSON: a TL;DR snapshot plus top stories, without summaries.

## Sub-features

- `public-get` returns JSON 200 with `tldr` and `stories`.
- `public-shape` keeps story objects slim (`id`, `url`, `title`, …) and omits `summary`.
- `public-cors` answers OPTIONS from a `chrome-extension://` origin.

## How to get to it (user POV)

- Open `https://aidr.today/api/public` in a browser.
- The new-tab extension fetches the same URL.
- Smoke: `curl https://aidr.today/api/public`.

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true` (this feature is the JSON half of doctor).

- **GET digest.** Run `.cursor/skills/verify-aidr/bin/verify-aidr drive api-public`. HTTP 200, `content-type` includes `json`, body parses, `stories` is an array.
- **Shape.** Each story has string `id`, `url`, and `title`. No story has a `summary` key. `tldr` is `null` or `{ date, bullets_en, bullets_vi }`.
- **Size.** If `content-length` is present, it is under 50 KB.
- **CORS.** `OPTIONS /api/public` from `Origin: chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef` returns 204 or 200, not HTML, with matching `Access-Control-Allow-Origin`.
- **Proof.** Evidence file `api-public.json` plus `api-public-cors.json`.

## Gotchas

- This payload is slimmer than `/api/feed`. Do not require `days`, `categories`, or `summary`.
- TanStack SPA fallback used to serve HTML for OPTIONS; CORS must not be `text/html`.
- Doctor already GETs this URL. Drive still re-fetches and writes the body into evidence.
