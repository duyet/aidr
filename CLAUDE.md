# CLAUDE.md

aidr / AI;DR monorepo — Cloudflare **Workers** (not Pages) at https://aidr.today.

## Before changing the pipeline

Read [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md) before changing ingest, ranking, prompts, admin/MCP, or notify surfaces.

## Deploy

- Worker name: `aidr` (`apps/web/wrangler.toml`)
- Deploy: `pnpm --filter @aidr/web deploy` or `pnpm run cf:deploy:prod`
- Secrets: `apps/web/scripts/sync-secrets.ts` or `wrangler secret put`
- Account ID (committed): `7df185a18b98382c3240fa7ac4a37075`
- Zone ID aidr.today: `e89512b5edc14f2f790aa3eb47f60944`

## Local

```bash
pnpm install
cp .env.example .env.local
pnpm --filter @aidr/web dev
```

## Verify

Narrowest first: `pnpm exec biome lint <path>`, then `pnpm --filter @aidr/web test` / `check-types`. Root: `pnpm run lint`, `pnpm run test`, `pnpm run check-types`.
