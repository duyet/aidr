---
name: verify-aidr
description: Drive and prove aidr.today (AI news digest — TL;DR + ranked stories), the Chrome extension package, analytics attribution, and the public Telegram path. Use mid-ship or /poteto-mode when verifying homepage/feed, AI;DR, /about, /extension, channel workflows, or GET /api/public before claiming a public-surface change works.
---

# Verify aidr (aidr.today)

Agent-facing skill for the Cloudflare Worker + TanStack Start site at `apps/web` (live: `https://aidr.today`). Public callers use HTTP. The Chrome new-tab package lives in `apps/extension`. Do not treat `pnpm test` / `check-types` as proof that the live Worker is healthy.

Harness binary (the lever): `.agents/skills/verify-aidr/bin/verify-aidr`. Always invoke it by that path from the repo root. It prints JSON. Evidence survives cleanup under `.agents/skills/verify-aidr/evidence/<run-id>/` (gitignored except README).

Feature map: [`features/README.md`](features/README.md). Drive the mapped feature you are claiming, not a convenient substitute.

## Launch

Default target is **live** `https://aidr.today`. There is no local server to keep alive.

```bash
.agents/skills/verify-aidr/bin/verify-aidr launch
```

Ready when JSON `ok: true` and `ready: true` (launch pings `GET /api/public`). Override the origin with `--base` or `VERIFY_AIDR_BASE`.

Optional local Worker (port 3014, same command as README):

```bash
.agents/skills/verify-aidr/bin/verify-aidr launch --local
```

Ready when `http://127.0.0.1:3014/` answers. Teardown with `cleanup`. Refuse to attach if 3014 is already taken — never drive a session this run did not start.

## Doctor

Read-only. Run first whenever anything looks off:

```bash
.agents/skills/verify-aidr/bin/verify-aidr doctor
```

Pass requires:

- `GET /api/public` → JSON 200 with parseable `{ tldr, stories }` (`tldr` null or `{ bullets_en, bullets_vi }`; stories are an array).
- `GET /` with Chrome UA → HTML 200.
- Homepage identity strings: `AI;DR`, `Hôm nay AI có gì mới?`, `AI News`, `aidr.today`, `AI News | ranked AI digest | aidr.today`.

- Pipeline check (below) is included when wrangler credentials work; if the D1 query cannot run, `pipeline` is `{ skipped: true, reason }` and does not fail doctor. Pipeline warnings do fail doctor.

Do not drive an instance whose doctor reports `ok: false`. HTML without Chrome UA may be challenged; the lever always sends one.

## Pipeline

Read-only. `/api/public` can be 200 while the hourly ingest or Telegram posting is dead. This check reads prod D1 (never writes; only `SELECT` is accepted) via `cd apps/web && npx wrangler d1 execute <database_name from wrangler.toml> --remote --json`:

```bash
.agents/skills/verify-aidr/bin/verify-aidr pipeline
```

Reports the latest `workflow_runs` row (age, error), its per-step actions, 24h counts of failed `tldr` steps and `anyrouter chain exhausted`, the last sent `notifications` row per channel with hours since, failed notifications in 24h, and a tally of notify step reasons (for example `telegram.trending=below_min_rank`). `started_at` and `posted_at` are read as ms (prod rows mix ms and seconds, so ordering and the 24h window normalize both).

Warns (`ok: false`, non-zero exit) when the last run is over 2h old, the last run has an error, no Telegram post for over 26h (a missed daily digest), any failed or ambiguous notification in 24h, or any failed tldr / chain-exhausted run in 24h. `doctor` includes the same block under `pipeline`.

## Doctor IV (Telegram Instant View field gate)

The machine-checkable field gate from `docs/decisions/telegram-instant-view.md`.
Read-only, public, and credential-free — it needs no bot token and no channel id.

```bash
.agents/skills/verify-aidr/bin/verify-aidr doctor iv --id <8hex> --lang vi
.agents/skills/verify-aidr/bin/verify-aidr doctor iv --id <8hex> --lang en
```

It prints a per-field verdict (`title` / `body` / `published_date` /
`image_url` / `site_name` / `description`), a range-probe of the generated card
(`/api/og/{id8}.png`, expected `200 image/png` at 1200×630), the exact source
URL to paste into the [IV Editor](https://instantview.telegram.org/), and the
still-unresolved items as labelled placeholders. Non-zero exit means the story
is not IV-eligible.

What it is **not**: it does not enable IV, does not build a `t.me/iv` link,
does not create a template, and does not send anything. The `{rhash-from-editor}`
token in its output is a literal placeholder — the only real `rhash` exists
inside an operator's own editor session. Never paste a made-up `rhash` into
this repo, and never point it at a production channel.

`--image <https url>` additionally runs the bounded, SSRF-checked preflight over
a candidate that is *not* the generated card, reporting `probe_bytes` and a
fail-closed reason.

## Drive

Prefer the lever over ad-hoc curl. Recipes live in `features/`. Stable handles:

- Routes: `/`, `/about`, `/subscribe`, `/api/public`, `/api/feed`. `/extension` redirects to `/subscribe`.
- Brand: `AI;DR` (header + digest heading).
- SSR default lang: Vietnamese (`Hôm nay AI có gì mới?`).
- Story permalink: `/[8-char-id]`. Old `/[category]/[8-char-id]` 301s to the flat slug.
- Get AI;DR: `/subscribe` tabs + Chrome Web Store; `/extension` → `/subscribe`.

```bash
.agents/skills/verify-aidr/bin/verify-aidr drive homepage
.agents/skills/verify-aidr/bin/verify-aidr drive tldr
.agents/skills/verify-aidr/bin/verify-aidr drive about
.agents/skills/verify-aidr/bin/verify-aidr drive extension
.agents/skills/verify-aidr/bin/verify-aidr drive api-public
.agents/skills/verify-aidr/bin/verify-aidr drive analytics
.agents/skills/verify-aidr/bin/verify-aidr drive telegram
.agents/skills/verify-aidr/bin/verify-aidr drive all
```

`drive all` is the full public-surface pass. Screenshot is optional and does not fail a drive when Chrome is missing.

## Evidence

Named location: `.agents/skills/verify-aidr/evidence/<run-id>/` (printed as `evidenceDir`). Override with `VERIFY_AIDR_EVIDENCE`. Capture:

- `doctor.json` — public JSON + homepage identity.
- `homepage.html` / `about.html` / `extension.html` — HTML bodies.
- `analytics-*.html` / `telegram-subscribe.html` — campaign and channel-link proof.
- `api-public.json` / `feed.json` / `tldr-public.json` — JSON bodies.
- `*-desktop.png` / `*-mobile.png` when Chrome can screenshot.
- `report.json` — last drive result.
- `doctor-iv-input.json` — the `doctor iv` run's id/lang/target. The gate's own JSON verdict is printed to stdout, so pipe it to a file when attaching it as evidence.

Proof standards:

- Exercise the live (or launched) HTTP surface, not only unit tests or markdown.
- Capture the request and the resulting body, not only a screenshot.
- `/api/public` must not leak `summary`. OPTIONS from `chrome-extension://` must not return HTML.
- An empty digest (`tldr: null`) is live data — report it, do not invent a UI bug.
- Cleanup must not delete this directory.

## Package and runtime checks

- For the unpacked Chrome extension, run `pnpm --filter @aidr/extension lint`, `pnpm --filter @aidr/extension test`, `pnpm --filter @aidr/extension build`, and `pnpm --filter @aidr/extension verify`. The verify command is the browser-backed package proof and writes extension screenshots/feature maps outside this skill's evidence directory.
- For website analytics, run `.agents/skills/verify-aidr/bin/verify-aidr drive analytics` for campaign/channel HTTP proof, then inspect the browser event queue for `page_view` and `channel_click`.
- For Telegram, run `.agents/skills/verify-aidr/bin/verify-aidr drive telegram`. Real delivery is intentionally skipped unless credentials are explicitly configured; never print or persist them.


```bash
.agents/skills/verify-aidr/bin/verify-aidr cleanup
```

Stops only the local PID this lever started (recorded in `evidence/.state.json`). Never `pkill vite` / `pkill workerd` / `pkill chrome`. Never delete `evidenceDir`.

## Helpers

```bash
.agents/skills/verify-aidr/bin/verify-aidr launch
.agents/skills/verify-aidr/bin/verify-aidr doctor
.agents/skills/verify-aidr/bin/verify-aidr doctor iv --id <8hex> --lang vi
.agents/skills/verify-aidr/bin/verify-aidr drive homepage
.agents/skills/verify-aidr/bin/verify-aidr drive tldr
.agents/skills/verify-aidr/bin/verify-aidr drive about
.agents/skills/verify-aidr/bin/verify-aidr drive extension
.agents/skills/verify-aidr/bin/verify-aidr drive api-public
.agents/skills/verify-aidr/bin/verify-aidr drive analytics
.agents/skills/verify-aidr/bin/verify-aidr drive telegram
.agents/skills/verify-aidr/bin/verify-aidr fetch --path /
.agents/skills/verify-aidr/bin/verify-aidr screenshot --path / --viewport mobile
.agents/skills/verify-aidr/bin/verify-aidr cleanup
```

`--help` or an empty invocation prints the same list instead of JSON. All other commands emit one JSON object on stdout. Non-zero exit means the claim is not verified.

## Proven drive

2026-09-06 — `.agents/skills/verify-aidr/bin/verify-aidr` against live `https://aidr.today`.

Verdict: **VERIFIED**. `launch` ping 200; `doctor` public JSON 200 (`tldr` 2026-09-06, 16+16 bullets, 8 stories, no `summary` leak) and homepage HTML 200 with Chrome UA (`AI;DR`, `Hôm nay AI có gì mới?`, `AI News | aidr.today`). `drive all` passed homepage (permalinks + `/api/feed` 4 days), tldr, about, extension (`Load unpacked`, unzip warning, no Web Store), api-public (GET 200 + OPTIONS 204 CORS). Optional `screenshot --viewport mobile` wrote a PNG of the live homepage. `cleanup` kept evidence.

```bash
.agents/skills/verify-aidr/bin/verify-aidr launch
.agents/skills/verify-aidr/bin/verify-aidr doctor
.agents/skills/verify-aidr/bin/verify-aidr drive all
.agents/skills/verify-aidr/bin/verify-aidr screenshot --path / --viewport mobile
.agents/skills/verify-aidr/bin/verify-aidr cleanup
```
