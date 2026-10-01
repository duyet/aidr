import { createFileRoute } from "@tanstack/react-router";
import {
  confirmSubscription,
  isSubscribeError,
} from "../../../worker/subscribe/handlers.js";
import type { Env } from "../../../worker/types.js";
import { SITE_URL } from "../../lib/site.js";

async function resolveEnv(context: any): Promise<Env | undefined> {
  let env: any =
    context?.cloudflare?.env || context?.env || (globalThis as any).CF_ENV;
  if (!env?.DB) {
    try {
      env = (await import("cloudflare:workers")).env;
    } catch {
      // not running in a workers runtime
    }
  }
  return env as Env | undefined;
}

type HandlerArgs = { request: Request; context: any };

/** Double opt-in landing: the link in the confirmation mail. Confirms, then
 * sends the reader to their settings page. */
export const Route = createFileRoute("/api/subscribe/confirm")({
  server: {
    handlers: {
      GET: async ({ request, context }: HandlerArgs) => {
        const env = await resolveEnv(context);
        if (!env?.DB) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        const token = new URL(request.url).searchParams.get("token");
        const result = await confirmSubscription(env, token);
        if (isSubscribeError(result)) {
          return Response.redirect(`${SITE_URL}/subscribe`, 302);
        }
        return Response.redirect(
          `${SITE_URL}/subscribe?settings=${encodeURIComponent(result.token)}`,
          302
        );
      },
    },
  },
});
