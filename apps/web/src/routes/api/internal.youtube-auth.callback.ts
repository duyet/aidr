import { createFileRoute } from "@tanstack/react-router";
import type { Env } from "../../../worker/types.js";
import { handleYoutubeAuthCallback } from "../../../worker/youtube-auth.js";

async function resolveEnv(context: any): Promise<Env | undefined> {
  let env: any =
    context?.cloudflare?.env || context?.env || (globalThis as any).CF_ENV;
  if (!env?.HTML_CACHE) {
    try {
      env = (await import("cloudflare:workers")).env;
    } catch {
      // not running in a workers runtime
    }
  }
  return env as Env | undefined;
}

export const Route = createFileRoute("/api/internal/youtube-auth/callback")({
  server: {
    handlers: {
      GET: async ({ request, context }: { request: Request; context: any }) => {
        const env = await resolveEnv(context);
        if (!env) return new Response("Not found", { status: 404 });
        return handleYoutubeAuthCallback(request, env);
      },
    },
  },
});
