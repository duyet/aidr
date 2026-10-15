import { createFileRoute } from "@tanstack/react-router";
import { recordExtensionEvent } from "../../../worker/ext-events";
import { fetchLatestAidrRelease } from "../../../worker/extension-zip";
import { utcDay } from "../../../worker/reads";
import type { Env } from "../../../worker/types";
import { extensionReleasePayload } from "../../lib/extension-release";
import { PUBLIC_CACHE_CONTROL } from "../../lib/public-api";

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

export const Route = createFileRoute("/api/extension")({
  server: {
    handlers: {
      GET: async ({ request, context }: HandlerArgs) => {
        const env = await resolveEnv(context);
        await recordExtensionEvent({
          ua: request.headers.get("User-Agent"),
          ip: request.headers.get("CF-Connecting-IP"),
          limiter: env?.READ_LIMITER,
          content: new URL(request.url).searchParams.get("utm_content"),
          db: env?.DB,
          day: utcDay(Date.now()),
        });
        const base = extensionReleasePayload();
        const latest = await fetchLatestAidrRelease();
        const body = latest
          ? {
              ...base,
              version: latest.version,
              tag: latest.tag,
            }
          : base;
        return Response.json(body, {
          headers: { "Cache-Control": PUBLIC_CACHE_CONTROL },
        });
      },
    },
  },
});
