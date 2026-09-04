# aidr / AI;DR

[https://aidr.today](https://aidr.today) — AI news digest: TL;DR snapshots plus ranked stories.

Cloudflare Worker (`aidr`), TanStack Start frontend, D1 as the primary store.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Site, API, ingest workflow (`@aidr/web`) |
| `apps/extension` | Chrome MV3 new-tab (`@aidr/extension`) |
| `packages/*` | Shared libs / UI |

Pipeline: [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md).

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill values (gitignored)
pnpm --filter @aidr/web dev  # http://localhost:3014
```

Extension (unpacked):

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → `apps/extension`

## Deploy

```bash
pnpm run deploy              # build + wrangler deploy
pnpm run cf:deploy:prod      # production env + smoke
```

CI: `.github/workflows/deploy-web.yml` on push to `main`/`master` when `apps/web`, `apps/extension`, `packages`, or lockfile change.

GitHub secrets: `CLOUDFLARE_API_TOKEN`, `VITE_CLERK_PUBLISHABLE_KEY`. Account ID for wrangler comes from `apps/web/wrangler.toml` (and the workflow env).

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

Zip: `https://aidr.today/aidr.zip` (built into the Worker).

1. Unzip → load unpacked → select the `aidr/` folder inside

Versioning: release-please on `apps/extension` (tags `aidr-v*`).

## Ingest

Primary: Durable Object alarm (`NewsIngestScheduler`).

Watchdog: `.github/workflows/ingest.yml` POSTs `/api/admin/ingest` with `NEWS_ADMIN_TOKEN`. Manual: Actions **workflow_dispatch**, or admin POST with `?force=1`.

No Worker `[triggers] crons` (Free plan limit) and no Workflow `schedules` (paid).

## Scripts

```bash
pnpm run lint
pnpm run test
pnpm run check-types
pnpm --filter @aidr/web smoke
```
