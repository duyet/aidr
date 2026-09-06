# Homepage / feed

The homepage is the ranked AI news feed: brand, daily AI;DR, category chips, and story rows that link to permalinks. SSR default language is Vietnamese.

## Sub-features

- `home-shell` renders the SSR shell with brand identity.
- `home-feed` lists ranked stories with permalinks.
- `home-feed-api` returns the same feed as JSON from `/api/feed`.
- `home-mobile` (optional) captures a phone viewport of `/`.

## How to get to it (user POV)

- Open `https://aidr.today/`.
- Follow the `News` header link back to `/`.
- Call `GET /api/feed` (same stories the page hydrates from).

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true` against the launched base (default `https://aidr.today`).

- **Open homepage.** Run `.cursor/skills/verify-aidr/bin/verify-aidr drive homepage`. HTTP 200 HTML includes `AI;DR`, `Hôm nay AI có gì mới?`, `AI News | aidr.today`, `aidr.today`, `og:title`, and `/og.jpg`.
- **Feed rows.** The saved `homepage.html` contains at least one story permalink matching `/[a-z0-9-]+/[0-9a-f]{8}`.
- **Feed API.** The same drive fetches `GET /api/feed` and requires `days[]` plus `categories[]`, with at least one day that has `items`.
- **Mobile viewport.** If Chrome is available, run `.cursor/skills/verify-aidr/bin/verify-aidr screenshot --path / --viewport mobile`. The PNG is optional proof; missing Chrome is a skip, not a product failure.

## Gotchas

- SSR lang is `vi`. Do not require `What's happening in AI today?` on the default homepage.
- A curl without Chrome UA may be challenged; the lever always sends Chrome UA for HTML.
- `/api/feed` is a larger payload than `/api/public`. Do not assert the slim public story shape here.
- Permalink regex is the 8-char id prefix in the path, not the full item UUID.
