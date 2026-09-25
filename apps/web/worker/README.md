# worker/

Ingestion backend for the news app: source adapters, LLM scoring/translation,
ranking, and the `NewsIngestWorkflow` Cloudflare Workflow. Primary store is
D1 (`aidr`). Owned by the backend agent; `apps/web/src/**` (frontend) is
separate territory.

## Wiring into the build (action needed from the frontend/entry-server owner)

`wrangler.toml` points `main` at `dist/server/server.js`, which is produced
by the TanStack Start / `@cloudflare/vite-plugin` build from `src/server.ts`.

For the Workflow class and Durable Object scheduler in this directory to end
up in the final Worker bundle, re-export them from `apps/web/src/server.ts`:

```ts
export { NewsIngestWorkflow } from "../worker/workflow";
export { NewsIngestScheduler } from "../worker/ingest-scheduler";
```

Everything else (migrations, adapters, LLM calls, ranking, the workflow
itself) is fully implemented in this directory and does not depend on the
frontend.

## Clerk proxy edge rate limit

`/__clerk/*` has no application/isolate rate limiter; the D1 limiter is for
submission workflows and is not a safe fit for this streaming proxy. Before a
production or preview rollout, configure a Cloudflare WAF Rate Limiting rule
for the public `/__clerk/*` path (for example, 120 requests per 60 seconds per
source IP with a short burst allowance; tune to observed traffic). Keep the
control at the edge so abusive requests are rejected before they consume Worker
subrequest capacity. This
repository documents the control but does not invent a Worker namespace/binding
or change deployment settings. `CLERK_PROXY_URL` in `wrangler.toml` is the
canonical deploy value; non-development builds reject an env override that
would make the browser and generated Worker config diverge.

## Clerk proxy requires `CLERK_SECRET_KEY` in the Worker env

`handleClerkProxy` returns `503 Clerk proxy misconfigured: missing
CLERK_SECRET_KEY` when the binding is absent. Clerk `>=1.6` removed keyless
mode, so nothing provisions a key for a deployed Worker — the key must already
be a Worker secret. Worker secrets are pushed out of band by
`pnpm sync-env --workers` (`wrangler secret bulk`), never by the deploy
workflow, so a missing key is otherwise invisible until sign-in breaks.

Both deploy paths assert the proxy is live, so a missing key fails the deploy
instead of shipping:

- `pnpm run smoke` (the local `cf:deploy:prod` path) checks
  `GET /__clerk/v1/environment` returns `200` with `auth_config`.
- `.github/workflows/deploy-web.yml` runs an equivalent post-deploy
  `Smoke — /__clerk/v1/environment` step. A `503` there means
  `CLERK_SECRET_KEY` is not in the Worker env; re-push it with
  `pnpm sync-env --workers`. Both checks assert the HTTP status only and never
  echo the key or the response body.

The focused proxy tests run under Node/Vitest and cannot fully model workerd's
subrequest body streaming and abort behavior. The local workerd harness is
available with `pnpm --filter @aidr/web test:workerd:clerk-proxy`; a deployed
workerd smoke test is still required before rollout for production streaming
POSTs, response-body deadlines, and manual redirects. The handler caps request
and response bodies at 1 MiB. Request bodies are bounded and pre-read before
subrequest dispatch, so an early upstream response cannot bypass the limit. It
reads one response chunk to provide a controlled 504 when the upstream stalls
before sending data, then streams counted chunks and cancels/errors the stream
when the limit or deadline is reached.

## Clerk → D1 signup mirror

`/data` reports AIDR signups as a first-class Overview metric. The number is a
`COUNT` over `clerk_users` in D1 (migration `0026_clerk_users.sql`), not a live
call to Clerk on every page view — a public dashboard endpoint must not fail
because a third-party API is slow or rate-limited.

Two writers keep that table current:

- `POST /api/webhooks/clerk` (`src/routes/api/webhooks.clerk.ts`) handles
  `user.created`, `user.updated`, and `user.deleted`. Every request must carry
  Clerk's Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) and is
  verified with HMAC-SHA256 over `{svix-id}.{svix-timestamp}.{body}` against
  `CLERK_WEBHOOK_SECRET` (WebCrypto, constant-time compare). A bad or missing
  signature is `401`; an oversized body is `413`; a missing secret or D1 binding
  is `503`. Any other event type is acknowledged and ignored so Clerk does not
  retry an event we deliberately do not store. Deletions are soft
  (`deleted_at`), so the live count stays correct without losing the audit row.
- `POST /api/admin/clerk-sync` is the admin-gated one-shot backfill that pages
  through the Clerk user list with `CLERK_SECRET_KEY` (100 per page, capped at
  20 pages). It exists so the metric is real before the first webhook lands;
  afterwards the webhook keeps it current.

`GET /api/system/accounts` reads the count with a five-minute cache and reports
`{ total, source: "d1", status }`, where `status` is `available`, `unconfigured`
(table missing / no rows yet), or `error`. `total` is `null` for the last two —
the UI says "Unavailable" instead of rendering a fabricated `0`.

Apply the migration before deploying the code that reads it — the same command
`apps/web/README.md` documents, and the same one CI runs on `master` via
`.github/workflows/migrate-d1.yml`:

```sh
pnpm --filter @aidr/web d1:migrate
```

`worker/migration-gate.ts` treats `0026` as a required migration once its file
is present, so a deploy against an unmigrated database fails loudly instead of
serving a permanently "Unavailable" signups tile.
