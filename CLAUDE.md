# CLAUDE.md

aidr / AI;DR monorepo — Cloudflare **Workers** (not Pages) at https://aidr.today.

## Before changing the pipeline

Read [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md) before changing ingest, ranking, prompts, admin/MCP, or notify surfaces.

## Deploy

- Worker name: `aidr` (`apps/web/wrangler.toml`)
- Deploy: `pnpm --filter @aidr/web deploy` or `pnpm run cf:deploy:prod`
- Secrets: `pnpm sync-env` (GitHub Actions + Worker) — see `scripts/sync-env.ts`
- Account / zone IDs: `apps/web/wrangler.toml` + Cloudflare dashboard (not in env docs)

## Local

```bash
pnpm install
cp .env.example .env.local
pnpm --filter @aidr/web dev
```

## Verify

Narrowest first: `pnpm exec biome lint <path>`, then `pnpm --filter @aidr/web test` / `check-types`. Root: `pnpm run lint`, `pnpm run test`, `pnpm run check-types`.
