import { createFileRoute } from "@tanstack/react-router";
import {
  confirmSubscription,
  isSubscribeError,
  type Schedule,
  settingsChangeFromParams,
} from "../../../worker/subscribe/handlers.js";
import type { Env } from "../../../worker/types.js";
import { SITE_URL } from "../../lib/site.js";

async function resolveWaitUntil(): Promise<Schedule> {
  return (await import("cloudflare:workers")).waitUntil;
}

async function resolveEnv(context: any): Promise<Env | undefined> {
  let env: any =
    context?.cloudflare?.env || context?.env || (globalThis as any).CF_ENV;
  if (!env?.DB) {
    try {
      env = (await import("cloudflare:workers")).env;
    } catch {}
  }
  return env as Env | undefined;
}

// Response.redirect() has immutable headers; the server wrapper adds headers.
function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

type HandlerArgs = { request: Request; context: any };

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
        const params = new URL(request.url).searchParams;
        const token = params.get("token");
        const result = await confirmSubscription(
          env,
          token,
          settingsChangeFromParams(params),
          await resolveWaitUntil()
        );
        if (isSubscribeError(result)) {
          return redirect(`${SITE_URL}/subscribe`);
        }
        return redirect(
          `${SITE_URL}/subscribe?settings=${encodeURIComponent(result.token)}`
        );
      },
    },
  },
});
