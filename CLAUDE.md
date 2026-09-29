# CLAUDE.md

aidr / AI;DR monorepo — Cloudflare **Workers** (not Pages) at https://aidr.today.

## Before changing the pipeline

Read [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md) before changing ingest, ranking, prompts, admin/MCP, or notify surfaces. One hourly run consumes sources, ranks items, writes `tldr_snapshots`, then publishes that edition to email and Telegram. Language columns do not fall back to each other (`worker/digest/edition.ts`).

Telegram Instant View contract and manual checklist: [`docs/decisions/telegram-instant-view.md`](docs/decisions/telegram-instant-view.md).

## Deploy

- Worker name: `aidr` (`apps/web/wrangler.toml`)
- Deploy: `pnpm --filter @aidr/web deploy` or `pnpm run cf:deploy:prod`. D1 and Worker secrets use the `cf` CLI. `wrangler deploy` still uploads the Worker: `cf migrate` (cf 1.0.0-beta.5) drops Workflow and Durable Object bindings, which the hourly ingest needs. Config stays `apps/web/wrangler.toml`.
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

Live public surfaces: `.cursor/skills/verify-aidr/bin/verify-aidr doctor` then `drive <feature>` (skill `.cursor/skills/verify-aidr/`).
