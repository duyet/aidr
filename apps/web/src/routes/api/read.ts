import { createFileRoute } from "@tanstack/react-router";
import { decideRead, utcDay } from "../../../worker/reads.js";
import type { Env } from "../../../worker/types.js";

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

const NO_STORE = { "Cache-Control": "no-store" };

function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

type HandlerArgs = { request: Request; context: any };

export const Route = createFileRoute("/api/read")({
  server: {
    handlers: {
      POST: async ({ request, context }: HandlerArgs) => {
        try {
          const env = await resolveEnv(context);
          if (!env?.DB) return noContent();
          const status = await decideRead({
            ua: request.headers.get("User-Agent"),
            fetchSite: request.headers.get("Sec-Fetch-Site"),
            body: await request.text(),
            db: env.DB,
            day: utcDay(Date.now()),
          });
          if (status === 204) return noContent();
          return Response.json(
            { error: status === 404 ? "not_found" : "invalid_read" },
            { status, headers: NO_STORE }
          );
        } catch (e) {
          // A reader never sees a counter failure, including the table
          // missing before migration 0065 is applied.
          console.error("read:", e);
          return noContent();
        }
      },
    },
  },
});
