# AGENTS.md

AI;DR (aidr.today) monorepo. A Cloudflare Worker ingests AI news every 30 minutes, ranks it, and publishes one edition in English and Vietnamese. This file routes you. The details live in the linked files.

## Read first

| If you change | Read |
|---|---|
| Ingest, ranking, prompts, admin or MCP, notify | [`apps/web/ALGORITHM.md`](apps/web/ALGORITHM.md) |
| Deploy, secrets, D1, `cf` versus `wrangler` | [`CLAUDE.md`](CLAUDE.md) and the `aidr-ops` skill |
| Telegram message format | [`docs/decisions/telegram-instant-view.md`](docs/decisions/telegram-instant-view.md) |
| Anything else, or an unknown area | [`README.md`](README.md) |

## Where things are

| Path | What it is | Notes |
|---|---|---|
| [`apps/web`](apps/web/README.md) | Site, API, ingest workflow (`@aidr/web`) | Worker entry `src/server.ts`, pipeline in `worker/` |
| [`apps/extension`](apps/extension/README.md) | Chrome new-tab extension | Plain JS, no bundler |
| [`apps/email`](apps/email/README.md) | Email Worker for `submit@aidr.today` | Writes one D1 row, sends nothing |
| [`packages/ui`](packages/ui/README.md), [`packages/libs`](packages/libs/README.md) | Shared UI and helpers | Imported as source |
| [`.agents/skills`](.agents/skills/README.md) | Repo skills, indexed by task | `.claude`, `.cursor`, and `.devin` link to it |
| [`plans`](plans/README.md) | Self-contained plans for other agents | |

## Commands

Run the narrowest check first.

```bash
pnpm install
pnpm exec biome lint <path>             # lint only what you touched
pnpm --filter @aidr/web test            # vitest over worker/ and src/
pnpm --filter @aidr/web check-types
pnpm run validate                       # everything, including a build
pnpm dev                                # http://localhost:3014
```

## Rules that bite

- Do not deploy, write to remote D1, or sync secrets unless the task says so. The `aidr-ops` and `aidr-validate` skills give the safe order.
- Never merge release-please PRs (`chore(main): release X.Y.Z`). A human does.
- Build secret-shaped test fixtures from string parts at runtime. `no-secret-literals.test.ts` fails on any tracked literal.
- Add a migration to `apps/web/migrations` with the next number. The deploy gate requires every file from `0023` up.
- English and Vietnamese columns never fall back to each other.
- Prove a change on the real surface with `.agents/skills/verify-aidr/bin/verify-aidr`, not only with unit tests.
