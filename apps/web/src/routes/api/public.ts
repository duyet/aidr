import { createFileRoute } from "@tanstack/react-router";
import { resolveLang } from "../../lib/lang";
import { localeCacheControl } from "../../lib/locale-url";
import { PUBLIC_CACHE_CONTROL, servePublicApi } from "../../lib/public-api";

// type alias (not interface): TanStack routeTree.gen must re-export handler
// shapes; a non-exported interface triggers TS4023 on ApiPublicRoute.
type HandlerArgs = { request: Request; context: any };

export const Route = createFileRoute("/api/public")({
  server: {
    handlers: {
      GET: async ({ request, context }: HandlerArgs) => {
        let env =
          context?.cloudflare?.env ||
          context?.env ||
          (globalThis as any).CF_ENV;
        if (!env?.DB) {
          try {
            env = (await import("cloudflare:workers")).env;
          } catch {
            // not running in a workers runtime
          }
        }
        const url = new URL(request.url);
        const lang = resolveLang({
          search: url.search,
          cookie: request.headers.get("cookie"),
          acceptLanguage: request.headers.get("accept-language"),
        });
        const response = await servePublicApi(env?.DB, lang);
        const policy = localeCacheControl(url.search, PUBLIC_CACHE_CONTROL);
        const headers = new Headers(response.headers);
        if (response.status === 200) {
          headers.set("Cache-Control", policy.cacheControl);
          if (policy.vary) headers.set("Vary", policy.vary);
        }
        headers.set("Content-Language", lang);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      },
    },
  },
});
