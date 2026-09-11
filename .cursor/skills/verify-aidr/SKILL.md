---
name: verify-aidr
description: Drive and prove aidr.today (AI news digest — TL;DR + ranked stories) over live HTTP. Use mid-ship or /poteto-mode when verifying homepage/feed, AI;DR, /about, /extension, or GET /api/public before claiming a public-surface change works.
---

# Verify aidr (aidr.today)

Agent-facing skill for the Cloudflare Worker + TanStack Start site at `apps/web` (live: `https://aidr.today`). Public callers use HTTP. The Chrome new-tab package lives in `apps/extension`. Do not treat `pnpm test` / `check-types` as proof that the live Worker is healthy.

Harness binary (the lever): `.cursor/skills/verify-aidr/bin/verify-aidr`. Always invoke it by that path from the repo root. It prints JSON. Evidence survives cleanup under `.cursor/skills/verify-aidr/evidence/<run-id>/` (gitignored except README).

Feature map: [`features/README.md`](features/README.md). Drive the mapped feature you are claiming, not a convenient substitute.

## Launch

Default target is **live** `https://aidr.today`. There is no local server to keep alive.

```bash
.cursor/skills/verify-aidr/bin/verify-aidr launch
```

Ready when JSON `ok: true` and `ready: true` (launch pings `GET /api/public`). Override the origin with `--base` or `VERIFY_AIDR_BASE`.

Optional local Worker (port 3014, same command as README):

```bash
.cursor/skills/verify-aidr/bin/verify-aidr launch --local
```

Ready when `http://127.0.0.1:3014/` answers. Teardown with `cleanup`. Refuse to attach if 3014 is already taken — never drive a session this run did not start.

## Doctor

Read-only. Run first whenever anything looks off:

```bash
.cursor/skills/verify-aidr/bin/verify-aidr doctor
```

Pass requires:

- `GET /api/public` → JSON 200 with parseable `{ tldr, stories }` (`tldr` null or `{ bullets_en, bullets_vi }`; stories are an array).
- `GET /` with Chrome UA → HTML 200.
- Homepage identity strings: `AI;DR`, `Hôm nay AI có gì mới?`, `AI News`, `aidr.today`, `AI News | aidr.today`.

Do not drive an instance whose doctor reports `ok: false`. HTML without Chrome UA may be challenged; the lever always sends one.

## Drive

Prefer the lever over ad-hoc curl. Recipes live in `features/`. Stable handles:

- Routes: `/`, `/about`, `/subscribe`, `/api/public`, `/api/feed`. `/extension` redirects to `/subscribe`.
- Brand: `AI;DR` (header + digest heading).
- SSR default lang: Vietnamese (`Hôm nay AI có gì mới?`).
- Story permalink: `/[category]/[8-char-id]`.
- Get AI;DR: `/subscribe` tabs + Chrome Web Store; `/extension` → `/subscribe`.

```bash
.cursor/skills/verify-aidr/bin/verify-aidr drive homepage
.cursor/skills/verify-aidr/bin/verify-aidr drive tldr
.cursor/skills/verify-aidr/bin/verify-aidr drive about
.cursor/skills/verify-aidr/bin/verify-aidr drive extension
.cursor/skills/verify-aidr/bin/verify-aidr drive api-public
.cursor/skills/verify-aidr/bin/verify-aidr drive all
```

`drive all` is the full public-surface pass. Screenshot is optional and does not fail a drive when Chrome is missing.

## Evidence

Named location: `.cursor/skills/verify-aidr/evidence/<run-id>/` (printed as `evidenceDir`). Override with `VERIFY_AIDR_EVIDENCE`. Capture:

- `doctor.json` — public JSON + homepage identity.
- `homepage.html` / `about.html` / `extension.html` — HTML bodies.
- `api-public.json` / `feed.json` / `tldr-public.json` — JSON bodies.
- `*-desktop.png` / `*-mobile.png` when Chrome can screenshot.
- `report.json` — last drive result.

Proof standards:

- Exercise the live (or launched) HTTP surface, not only unit tests or markdown.
- Capture the request and the resulting body, not only a screenshot.
- `/api/public` must not leak `summary`. OPTIONS from `chrome-extension://` must not return HTML.
- An empty digest (`tldr: null`) is live data — report it, do not invent a UI bug.
- Cleanup must not delete this directory.

## Cleanup

```bash
.cursor/skills/verify-aidr/bin/verify-aidr cleanup
```

Stops only the local PID this lever started (recorded in `evidence/.state.json`). Never `pkill vite` / `pkill workerd` / `pkill chrome`. Never delete `evidenceDir`.

## Helpers

```bash
.cursor/skills/verify-aidr/bin/verify-aidr launch
.cursor/skills/verify-aidr/bin/verify-aidr doctor
.cursor/skills/verify-aidr/bin/verify-aidr drive homepage
.cursor/skills/verify-aidr/bin/verify-aidr drive tldr
.cursor/skills/verify-aidr/bin/verify-aidr drive about
.cursor/skills/verify-aidr/bin/verify-aidr drive extension
.cursor/skills/verify-aidr/bin/verify-aidr drive api-public
.cursor/skills/verify-aidr/bin/verify-aidr fetch --path /
.cursor/skills/verify-aidr/bin/verify-aidr screenshot --path / --viewport mobile
.cursor/skills/verify-aidr/bin/verify-aidr cleanup
```

`--help` or an empty invocation prints the same list instead of JSON. All other commands emit one JSON object on stdout. Non-zero exit means the claim is not verified.

## Proven drive

2026-09-06 — `.cursor/skills/verify-aidr/bin/verify-aidr` against live `https://aidr.today`.

Verdict: **VERIFIED**. `launch` ping 200; `doctor` public JSON 200 (`tldr` 2026-09-06, 16+16 bullets, 8 stories, no `summary` leak) and homepage HTML 200 with Chrome UA (`AI;DR`, `Hôm nay AI có gì mới?`, `AI News | aidr.today`). `drive all` passed homepage (permalinks + `/api/feed` 4 days), tldr, about, extension (`Load unpacked`, unzip warning, no Web Store), api-public (GET 200 + OPTIONS 204 CORS). Optional `screenshot --viewport mobile` wrote a PNG of the live homepage. `cleanup` kept evidence.

```bash
.cursor/skills/verify-aidr/bin/verify-aidr launch
.cursor/skills/verify-aidr/bin/verify-aidr doctor
.cursor/skills/verify-aidr/bin/verify-aidr drive all
.cursor/skills/verify-aidr/bin/verify-aidr screenshot --path / --viewport mobile
.cursor/skills/verify-aidr/bin/verify-aidr cleanup
```
