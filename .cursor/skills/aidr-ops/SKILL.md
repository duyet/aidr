---
name: aidr-ops
description: Validate, sync, and deploy aidr.today (AI;DR) secrets and Worker config. Use before any `pnpm sync-env`, `deploy`, or Clerk/admin-credential change, and when sign-in, the signup count, or the Clerk webhook misbehave. Catches mixed Clerk instances, expired Cloudflare tokens, and missing Worker secrets before they reach production.
---

# aidr-ops — validate, sync, deploy

Operational skill for the Cloudflare Worker at `apps/web` (live: `https://aidr.today`, Worker name `aidr`).

**Run `preflight` before any write to production.** Every command is gated behind it, and it exits non-zero when something is wrong. It never prints a secret value — only `abcd…wxyz` masks.

```bash
.cursor/skills/aidr-ops/bin/aidr-ops preflight   # read-only, no writes
.cursor/skills/aidr-ops/bin/aidr-ops sync        # preflight, then push secrets to the Worker
.cursor/skills/aidr-ops/bin/aidr-ops deploy      # preflight, then deploy
.cursor/skills/aidr-ops/bin/aidr-ops verify      # read-only live probes
```

## What preflight checks

| Check | Catches |
|---|---|
| `cloudflare-auth` | `CLOUDFLARE_API_TOKEN` expired/revoked (CF code `1000`, or `9109` from wrangler) — the silent cause of "I can't push secrets" |
| `clerk-key-pair` | `pk_test` + `sk_live` and similar **mixed Clerk instances**, and the two publishable keys disagreeing |
| `required-secrets` | Any of `ANYROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `NEWS_ADMIN_TOKEN`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` missing |
| `live-handshake` | `502 Clerk upstream redirect rejected` — session refresh broken, login looks fine until a token expires |
| `live-webhook` | `503` = `CLERK_WEBHOOK_SECRET` missing on the Worker; `401`/`400` = present and verifying correctly |
| `live-signups` | Signup mirror empty (`unconfigured`) — needs the admin backfill |

## Repo-specific facts this encodes

These look like mistakes but are **correct** here. Do not "fix" them:

- **A publishable key decoding to `clerk.aidr.today` is intentional.** That CNAME is broken by Cloudflare Error 1014, which is exactly why `worker/clerk-proxy.ts` proxies the Frontend API to `frontend-api.clerk.dev`. See Clerk's "proxy FAPI" guide.
- **`CLERK_PUBLISHABLE_KEY` may be absent.** `scripts/sync-env.ts` aliases it from `VITE_CLERK_PUBLISHABLE_KEY`; they are one key. Only flag it if both exist and *disagree*.
- **A `200` from `/__clerk/v1/environment` is correct**, not an error. That is the proxy liveness probe.

## Traps

- **`sync-env` never passes `.env.local` to wrangler.** `scripts/sync-env.ts` spawns wrangler with `env: process.env`, so a token that lives only in `.env.local` is invisible to it. `aidr-ops sync` exports `CLOUDFLARE_API_TOKEN` for the child process to work around this. The underlying bug is still unfixed — worth a separate PR.
- **The deploy gate is fail-closed.** Once #211 landed, a missing `CLERK_WEBHOOK_SECRET` fails `deploy-web.yml` at "Smoke — /api/webhooks/clerk configured". That is intentional: it turns a silently dead signup sync into a loud failure. Push the secret *before* merging anything that relies on it.
- **Merging to `master` deploys to production.** `deploy-web.yml` triggers on `apps/web/**`, `apps/extension/**`, `packages/**`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`. Every web PR is a release.
- **Registering the Clerk webhook endpoint does not backfill history.** The endpoint (`https://aidr.today/api/webhooks/clerk`, events `user.created`/`user.updated`/`user.deleted`) only delivers *future* signups. Existing accounts still need `POST /api/admin/clerk-sync`.

## Restoring a signup count

The mirror reads `unconfigured` (not a fabricated `0`) until a row lands. Two ways to populate:

```bash
# Option A — shared secret (needs the Worker's NEWS_ADMIN_TOKEN)
curl -X POST -H "Authorization: Bearer $NEWS_ADMIN_TOKEN" \
  https://aidr.today/api/admin/clerk-sync

# Option B — sign in to Clerk as an admin and use the sync button on /data
```

`checkAdminAuth` (`worker/admin/auth.ts`) accepts either the `NEWS_ADMIN_TOKEN` **or** a Clerk session JWT belonging to an admin user, so option B needs no token. The backfill caps at 20 pages × 100 = 2000 accounts and only upserts — it will not soft-delete accounts missing from Clerk.

## Escalation

If `preflight` fails on `cloudflare-auth`, a fresh token needs **Account → Workers Scripts → Edit**. Secrets already set in the dashboard can be re-set to rotate them, but values saved as encrypted secrets cannot be read back.
