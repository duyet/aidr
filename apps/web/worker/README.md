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
control at the edge so abusive
requests are rejected before they consume Worker subrequest capacity. This
repository documents the control but does not invent a Worker namespace/binding
or change deployment settings.

The focused proxy tests run under Node/Vitest and cannot fully model workerd's
subrequest body streaming and abort behavior. A deployed workerd smoke test is
still required before rollout for streaming POSTs, response-body deadlines, and
manual redirects. The handler caps request bodies at 1 MiB and buffers at most
16 MiB of an upstream response so a stalled body can become a controlled 504.
