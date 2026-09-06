# aidr verification map

This directory is the maintained source for verifying the public surfaces of aidr / AI;DR (`https://aidr.today`). Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Default target is live `https://aidr.today`. Override with `VERIFY_AIDR_BASE` or `verify-aidr launch --base <url>`.
- Invoke the lever from the repo root: `.cursor/skills/verify-aidr/bin/verify-aidr`.
- Run `verify-aidr doctor` first. Require `ok: true` (public JSON 200 and homepage HTML 200 with Chrome UA plus identity strings).
- Cloudflare may challenge a non-browser User-Agent. Homepage HTML checks must send the Chrome UA the lever uses; `/api/public` is JSON and does not need that UA.
- SSR default language is Vietnamese. Assert `Hôm nay AI có gì mới?` on `/`, not the English tagline.
- Never `pkill` vite/workerd/chrome. Never delete proof artifacts during cleanup.
- Do not treat `pnpm test` / `check-types` as proof that the live Worker is healthy.

## Driving conventions

- Start every recipe from `doctor` unless the feature names a different precondition.
- Treat route paths as literal (`/`, `/about`, `/extension`, `/api/public`).
- Run HTTP through `verify-aidr fetch` / `verify-aidr drive <feature>`.
- Screenshots are optional. `verify-aidr screenshot --path / --viewport mobile` when Chrome/Chromium is on `PATH`.
- Restore nothing: these features are read-only against the public site.

## Proof and skip reporting

- Capture the request (URL, status, UA) and the resulting body, not only a screenshot.
- HTML proof includes identity strings (`AI;DR`, `aidr.today`) in the saved body.
- JSON proof includes the parsed shape (`tldr`, `stories`) and that `summary` is absent from public stories.
- Record the feature ID with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- An empty live digest (`tldr: null`) is a data state, not a UI bug to invent in a verification-skill PR.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-aidr` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Homepage / feed](./homepage.md) covers the ranked story list, SSR shell, and `/api/feed`.
- [AI;DR](./tldr.md) covers the daily digest on `/` and bullets on `/api/public`.
- [About](./about.md) covers `/about` (English-only pipeline + install pointer).
- [Chrome extension guide](./extension.md) covers `/extension` and `aidr.zip`.
- [Public API](./api-public.md) covers unauthenticated `GET /api/public` and CORS preflight.
