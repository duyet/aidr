<div align="center">

<a href="https://aidr.today"><img src="apps/web/public/logo.png" alt="AI;DR" width="120" height="120"></a>

# AI;DR

**What's new in AI today?** Ranked AI news with a short daily digest, in English and Vietnamese.

[![Website](https://img.shields.io/badge/Website-aidr.today-111111?style=for-the-badge)](https://aidr.today)
[![Chrome](https://img.shields.io/badge/Chrome-extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg)
[![Telegram VI](https://img.shields.io/badge/Telegram-@aihomnay-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/aihomnay)
[![Telegram EN](https://img.shields.io/badge/Telegram-@aidr__today-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/aidr_today)
[![RSS](https://img.shields.io/badge/RSS-feed.xml-FFA500?style=for-the-badge&logo=rss&logoColor=white)](https://aidr.today/feed.xml)
[![Sponsor](https://img.shields.io/badge/Sponsor-this%20project-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/duyet)

<a href="https://www.youtube.com/watch?v=tynoWx03zDc"><img src="https://img.youtube.com/vi/tynoWx03zDc/maxresdefault.jpg" alt="Watch the AI;DR introduction video" width="820"></a>

<sub>▶ <a href="https://www.youtube.com/watch?v=tynoWx03zDc">Watch the introduction video</a> (30 seconds)</sub>

</div>

## Get AI;DR

| Channel | Link |
|---|---|
| Website | [aidr.today](https://aidr.today) |
| Chrome new tab | [Chrome Web Store](https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg) |
| Telegram (Vietnamese) | [@aihomnay](https://t.me/aihomnay) |
| Telegram (English) | [@aidr_today](https://t.me/aidr_today) |
| Email digest | [aidr.today/subscribe](https://aidr.today/subscribe?tab=email) |
| RSS | [feed.xml](https://aidr.today/feed.xml) |

## Stack

Cloudflare Worker (`aidr`), TanStack Start frontend, D1 as the primary store.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Site, API, ingest workflow (`@aidr/web`) |
| `apps/extension` | Chrome MV3 new-tab (`@aidr/extension`) |
| `apps/email` | Email Worker for `submit@aidr.today` (`@aidr/email`) |
| `packages/*` | Shared libs, UI, and tsconfig bases |
| `scripts` | Operator scripts run from the root (`sync-env`, Facebook token) |
| `docs` | Decision records and analytics event list |
| `plans` | Self-contained implementation plans for agents |
| `videos` | Video sources, built with HyperFrames ([`videos/README.md`](videos/README.md)) |
| `agents` | Managed-agent definitions (`aidr-daily-video`) |
| `.agents/skills` | Agent skills for this repo |

## Pipeline

The scheduler starts a `NewsIngestWorkflow` every 30 minutes, with a 25-minute coalesce (`INGEST_MIN_INTERVAL_MS`). The contract is [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md).

1. **Consume** — enabled sources (`worker/sources/`) are fetched, deduped, and enriched into `items`.
2. **Rank** — score, translate, then a pure `rank_score` (`worker/ranking.ts`). The top of the last 24h becomes today's TL;DR snapshot: `bullets_en` and `bullets_vi` (`worker/tldr.ts`).
3. **Publish** — one edition per language (`worker/digest/edition.ts`). Email uses the subscriber's timezone from 07:00 and their digest size. Telegram VI, Telegram EN, and the English Facebook Page (`facebook-en`) each post once from 08:00 `Asia/Ho_Chi_Minh`, on the same trending bar. A missing language column is skipped and retried; it is not filled from the other language.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill values (gitignored)
pnpm dev                     # http://localhost:3014 (runs pack-extension first)
```

The local D1 starts empty. Apply the schema with `cd apps/web && pnpm exec wrangler d1 migrations apply aidr --local`, and again after pulling a new migration: read paths assume every migration is applied and do not probe for missing columns.

Clerk is optional locally. With no `CLERK_SECRET_KEY`, the dev server skips Clerk and every page renders signed out. To sign in locally, use a Clerk development instance (`pk_test_` / `sk_test_`):

- `apps/web/.dev.vars`: `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`, for the Worker.
- `apps/web/.env.local`: `VITE_CLERK_PUBLISHABLE_KEY`, the same `pk_test_` key, for the browser. Vite does not read `.dev.vars`.

Vite also reads the repo-root `.env.local`. If that file holds production (`pk_live_`) keys, override `VITE_CLERK_PUBLISHABLE_KEY` in `apps/web/.env.local`, or the browser and the Worker use different Clerk instances. Local dev never uses the production proxy: an unset or non-loopback `CLERK_PROXY_URL` means dev keys talk to Clerk directly. Set `CLERK_PROXY_URL=http://localhost:3014/__clerk` to test the `/__clerk` proxy itself.

Extension (unpacked):

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → `apps/extension`

## Deploy

```bash
pnpm run deploy              # migration gate, build, artifact checks, wrangler deploy
pnpm run cf:deploy:prod      # production env, then deploy and smoke
```

`wrangler deploy` uploads the Worker because `cf migrate` cannot carry Workflow and Durable Object bindings yet (see CLAUDE.md). The deploy stops first if the remote D1 ledger lacks a migration (`apps/web/README.md`, "Migration gate").

CI, all in `.github/workflows/`:

| Workflow | Runs |
|---|---|
| `ci.yml` | Lint, tests, and types on pushes and PRs to `main`/`master`. |
| `validate.yml` | `validate:deploy-artifact` (a production build and Worker checks) on PRs and on pushes that touch app code. |
| `deploy-web.yml` | Deploys the Worker on a push to `main`/`master` that touches `apps/web`, `apps/extension`, `packages`, `package.json`, `pnpm-workspace.yaml`, or the lockfile. |
| `migrate-d1.yml` | Applies D1 migrations on a push that touches `apps/web/migrations`. |
| `ingest.yml` | Watchdog for the 30-minute ingest (see Ingest). |
| `release-please.yml` | Opens release PRs and attaches the extension zips. |
| `live-budget.yml`, `daily-reel.yml`, `secret-scan.yml` | Live performance budget, the daily video, and Gitleaks. |

GitHub secrets: `CLOUDFLARE_API_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY`. Account ID comes from `apps/web/wrangler.toml` (and the workflow env). D1 queries and secret sync use `cf`, not Wrangler.

Smoke: `curl https://aidr.today/api/public`

## Secrets

One command syncs local env → **GitHub Actions** + **Cloudflare Worker**:

```bash
cp .env.example .env.local   # fill values
pnpm sync-env                # both targets
pnpm sync-env --dry-run
pnpm sync-env --workers      # Worker only
pnpm sync-env --github       # GitHub only (repo + production env)
```

Alias: `pnpm config`. Non-secret config stays in `wrangler.toml` `[vars]`. Key list: `.env.example`.

## Extension release

Zip: `https://aidr.today/aidr.zip` redirects (302) to the `aidr.zip` asset of the newest GitHub release on an `aidr-v*` tag. The release workflow attaches it.

1. Unzip → load unpacked → select the `aidr/` folder inside

Versioning: release-please opens **separate** release PRs from separate
manifests (`.github/.release-please-web.json` and
`.github/.release-please-extension.json`). Leave those PRs for a human to merge.

- Website (`apps/web`) → `chore(web): release X.Y.Z`, tags `web-v*`
- Chrome extension (`apps/extension`) → `chore(extension): release X.Y.Z`, tags `aidr-v*`

Commits that touch each package path (and scopes like `feat(web):` /
`feat(extension):`) feed that package’s changelog. Merge the PR to cut
the GitHub Release.

## Ingest

Primary: Durable Object alarm (`NewsIngestScheduler`).

Watchdog: `.github/workflows/ingest.yml` POSTs `/api/admin/ingest` with `NEWS_ADMIN_TOKEN`. Manual: Actions **workflow_dispatch**, or admin POST with `?force=1`.

No Worker `[triggers] crons` (Free plan limit) and no Workflow `schedules` (paid).

## Scripts

```bash
pnpm run lint
pnpm run test
pnpm run check-types
pnpm run validate                # lint, types, tests, deploy artifact (runs a build)
pnpm --filter @aidr/web smoke    # live checks against https://aidr.today
```
