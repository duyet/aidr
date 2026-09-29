import { createFileRoute } from "@tanstack/react-router";
import type { ClerkWebhookEnv } from "../../../worker/clerk-webhook.js";
import { handleClerkWebhook } from "../../../worker/clerk-webhook.js";

async function resolveEnv(context: any): Promise<ClerkWebhookEnv> {
  let env: any =
    context?.cloudflare?.env || context?.env || (globalThis as any).CF_ENV;
  if (!env?.DB) {
    try {
      env = (await import("cloudflare:workers")).env;
    } catch {
      // not running in a workers runtime
    }
  }
  return (env ?? {}) as ClerkWebhookEnv;
}

// Clerk signs each delivery with the instance webhook secret; the handler
// rejects unverifiable ones with 401. `svix-signature` is a space-separated
// list of `v1,<base64>` entries, so keep the header intact on any proxy.
type HandlerArgs = { request: Request; context: any };

export const Route = createFileRoute("/api/webhooks/clerk")({
  server: {
    handlers: {
      POST: async ({ request, context }: HandlerArgs) =>
        handleClerkWebhook(request, await resolveEnv(context)),
    },
  },
});
