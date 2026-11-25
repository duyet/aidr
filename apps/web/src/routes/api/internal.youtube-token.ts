import { createFileRoute } from "@tanstack/react-router";
import type { Env } from "../../../worker/types.js";
import { handleYoutubeBrokerRequest } from "../../../worker/youtube-token.js";

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

export const Route = createFileRoute("/api/internal/youtube-token")({
  server: {
    handlers: {
      POST: async ({
        request,
        context,
      }: {
        request: Request;
        context: any;
      }) => {
        const env = await resolveEnv(context);
        if (!env) return Response.json({ error: "not found" }, { status: 404 });
        return handleYoutubeBrokerRequest(request, env);
      },
      GET: async () =>
        Response.json({ error: "method not allowed" }, { status: 405 }),
    },
  },
});
