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
