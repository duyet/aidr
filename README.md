# aidr / AI;DR

[https://aidr.today](https://aidr.today) — AI news digest (TL;DR + ranked stories).

Cloudflare **Workers** (not Pages). Worker name: `aidr` on **AnyRouter Inc.** account.

## Monorepo layout

| Path | Role |
|------|------|
| `apps/web` | TanStack Start + Worker (`@aidr/web`) — site, API, ingest workflow |
| `apps/extension` | Chrome MV3 new-tab extension (`@aidr/extension`) |
| `packages/*` | Shared libs / UI |

Pipeline design: [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md).

## Cloudflare IDs (not secrets)

| | |
|--|--|
| **Account** | AnyRouter Inc. |
| **Account ID** | `7df185a18b98382c3240fa7ac4a37075` |
| **Zone ID** (`aidr.today`) | `e89512b5edc14f2f790aa3eb47f60944` |
| **D1** | `aidr` (`0c8f3efe-0427-4268-8d9f-bb1a4bcbe427`) — data migrated from legacy `news` D1 |

`account_id` is set in `apps/web/wrangler.toml`. Use the Zone ID for DNS and custom-domain operations in the Cloudflare dashboard / API.

Custom domain: **`aidr.today`**. Legacy `news.duyet.net` stays on the old Worker (Duyet Personal account) until that app is retired.
## Local development

```bash
pnpm install
cp .env.example .env.local   # fill values
pnpm --filter @aidr/web dev  # http://localhost:3014
```

Extension (unpacked):

1. Open `chrome://extensions` → Developer mode
2. **Load unpacked** → select `apps/extension`

## Deploy

Workers via wrangler (builds client + Worker, then `wrangler deploy`):

```bash
pnpm --filter @aidr/web deploy
# or production + smoke:
pnpm --filter @aidr/web cf:deploy:prod
# root aliases:
pnpm run deploy
pnpm run cf:deploy:prod
```

CI: `.github/workflows/deploy-web.yml` deploys on push to `main` when `apps/web`, `apps/extension`, or `packages` change.

Required GitHub secrets for deploy: `CLOUDFLARE_API_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY`.  
`CLOUDFLARE_ACCOUNT_ID` is set in the workflow to `7df185a18b98382c3240fa7ac4a37075`.

Post-deploy smoke: `curl https://aidr.today/api/public` (workflow also runs this).

## Secrets

Worker secrets (API keys, ClickHouse, Telegram bot token, admin token, etc.):

```bash
# From apps/web, after filling root .env / .env.local / .env.production.local:
pnpm exec tsx scripts/sync-secrets.ts
pnpm exec tsx scripts/sync-secrets.ts --dry-run

# Or one at a time:
cd apps/web && pnpm exec wrangler secret put NEWS_ADMIN_TOKEN
```

Non-secret config (base URLs, chat id, model chains) can stay in `wrangler.toml` `[vars]`. See `.env.example` for the full key list.

## Extension release

Public zip: `https://aidr.today/aidr.zip` (packed into the Worker build).

Install from zip:

1. Unzip `aidr.zip`
2. Load unpacked → select the `aidr/` folder inside

Versioning: release-please on `apps/extension` (package-name `aidr`, tags `aidr-v*`, bumps `manifest.json` version).

## Ingest

Primary cadence: Durable Object alarm (`NewsIngestScheduler`) on the Worker.

Watchdog: `.github/workflows/ingest.yml` (four cron expressions per hour) POSTs `https://aidr.today/api/admin/ingest` with `NEWS_ADMIN_TOKEN`. Manual: Actions **workflow_dispatch**, or admin POST with `?force=1`.

Do not add Worker `[triggers] crons` (Free plan 5-cron cap) or Workflow `schedules` (paid plan).

## Scripts

```bash
pnpm run lint
pnpm run test
pnpm run check-types
pnpm --filter @aidr/web smoke   # live smoke against aidr.today
```
