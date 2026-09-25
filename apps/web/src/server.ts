import handler from "@tanstack/react-start/server-entry";
import { handleClerkProxy, isClerkProxyPath } from "../worker/clerk-proxy";
import { handleAidrZipRequest } from "../worker/extension-zip";
import { ensureIngestAlarm, tickIngest } from "../worker/ingest-schedule";
import { NewsIngestScheduler } from "../worker/ingest-scheduler";
import { handlePublicAsset } from "../worker/public-assets";
import { handlePublicCors } from "../worker/public-cors";
import { handleSubscribeCors } from "../worker/subscribe/cors";
import type { Env } from "../worker/types";
import { NewsIngestWorkflow } from "../worker/workflow";
import {
  handleAgentDiscovery,
  withHomepageHeaders,
} from "./lib/agent-discovery";
import { readSession } from "./lib/db";
import { llmsTxtResponse } from "./lib/llms-txt";
import {
  apiErrorResponse,
  LOCALE_PRIVATE_CACHE_CONTROL,
  LOCALE_VARY,
  localeErrorResponse,
  normalizeLocaleRequest,
  resolveRequestLocale,
  resolveServerFnLocaleRequest,
  temporaryLocaleRedirect,
  withSsrLocaleResponse,
} from "./lib/locale-response";
import {
  isLanguageNeutralSsrPath,
  isLocaleAwareApiPath,
  isPrivateSsrPath,
} from "./lib/locale-routing";
import { withLang } from "./lib/locale-url";
import { applyNotFoundHttpStatus } from "./lib/not-found-status";
import { withRouteIndexabilityHeaders } from "./lib/route-indexability";
import { hasServerFnId, isServerFnPath } from "./lib/server-fn-request";
import {
  buildSitemapXml,
  loadSitemapUrls,
  robotsResponse,
  safeSitemapResponse,
  sitemapResponse,
  staticSitemapUrls,
} from "./lib/sitemap";
import { legacyStoryRedirectPath } from "./lib/slug";
import {
  handleStoryMarkdownRequest,
  isStoryMarkdownPath,
} from "./lib/story-markdown";

async function resolveEnv(env?: Env): Promise<Env | undefined> {
  if (env?.DB) return env;
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as Env;
  } catch {
    return env;
  }
}

function isHtmlRequest(request: Request): boolean {
  return /(^|,)\s*(\*\/\*|text\/html)/.test(
    request.headers.get("Accept") || "*/*"
  );
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext) {
    const publicFile = await handlePublicAsset(request, env);
    if (publicFile) return publicFile;
    const path = new URL(request.url).pathname;
    // Keep the bounded, generated story representation ahead of the SPA
    // catch-all. It never fetches external Markdown; it renders sanitized D1
    // story data only.
    if (isStoryMarkdownPath(path)) {
      return handleStoryMarkdownRequest(request, env?.DB);
    }
    if (path === "/favicon.ico") {
      // Browsers auto-request /favicon.ico; we only ship /favicon.svg.
      // Redirect instead of 404ing through the SPA shell (console noise).
      const dest = new URL(request.url);
      dest.pathname = "/favicon.svg";
      return Response.redirect(dest.toString(), 301);
    }
    if (isClerkProxyPath(path)) {
      return withRouteIndexabilityHeaders(
        request,
        handleClerkProxy(request, env)
      );
    }
    if (path === "/aidr.zip") {
      return handleAidrZipRequest(request);
    }
    if (
      path === "/api/public" ||
      path === "/api/admin/ingest" ||
      path === "/api/system" ||
      path.startsWith("/api/system/")
    ) {
      ctx?.waitUntil?.(ensureIngestAlarm(env));
    }
    if (path === "/robots.txt") {
      return robotsResponse();
    }
    if (path === "/llms.txt") {
      return llmsTxtResponse();
    }
    const discovery = await handleAgentDiscovery(request);
    if (discovery) return discovery;
    if (path === "/sitemap.xml") {
      try {
        return await safeSitemapResponse(async () => {
          const resolved = await resolveEnv(env);
          return resolved?.DB
            ? loadSitemapUrls(readSession(resolved.DB))
            : staticSitemapUrls();
        });
      } catch (error) {
        console.error("sitemap.xml failed; serving static fallback", error);
        return sitemapResponse(buildSitemapXml(staticSitemapUrls()));
      }
    }

    // Locale aliases and malformed values are rejected before the SPA (or
    // route middleware) can turn them into a cacheable response. Public API
    // surfaces get the same gate at the Worker boundary; their handlers repeat
    // it for direct calls/tests. CORS preflight remains a language-neutral
    // transport exchange and is answered before locale selection.
    const isApi = path === "/api" || path.startsWith("/api/");
    const htmlRequest = isHtmlRequest(request);
    // Server functions are RPC. A submit call must reach its handler on any
    // request, so this path only gets a JSON locale rejection — never the
    // document gate's 307 or HTML error page.
    if (isServerFnPath(path)) {
      if (!hasServerFnId(path)) {
        return apiErrorResponse(404, {
          error: "server_function_not_found",
          message: "Unknown server function.",
        });
      }
      const invalid = resolveServerFnLocaleRequest(request);
      if (invalid) return invalid;
    } else if (
      !isApi ||
      (isLocaleAwareApiPath(path) && request.method !== "OPTIONS")
    ) {
      const url = new URL(request.url);
      const normalized = normalizeLocaleRequest(request, {
        format:
          (isApi && path !== "/api/subscribe/preview") || !htmlRequest
            ? "json"
            : "html",
        neutralPath:
          isLanguageNeutralSsrPath(path) && !isPrivateSsrPath(path, url.search),
        redirectPath: path === "/extension" ? "/subscribe" : undefined,
        allowRedirect: isApi || htmlRequest,
      });
      if (normalized) {
        return isApi ? handlePublicCors(request, () => normalized) : normalized;
      }
    }

    if (path === "/extension" && htmlRequest) {
      const dest = new URL(request.url);
      dest.pathname = "/subscribe";
      const resolution = resolveRequestLocale(request);
      if (!resolution.ok) {
        return localeErrorResponse(request, resolution, "html");
      }
      if (resolution.explicit || resolution.source !== "default") {
        return temporaryLocaleRedirect(
          request,
          withLang(dest.toString(), resolution.lang),
          resolution.lang
        );
      }
      return new Response(null, {
        status: 301,
        headers: {
          "Cache-Control": LOCALE_PRIVATE_CACHE_CONTROL,
          Location: dest.toString(),
          Vary: LOCALE_VARY,
        },
      });
    }

    const storyDest = legacyStoryRedirectPath(path);
    if (storyDest && htmlRequest) {
      const dest = new URL(request.url);
      dest.pathname = storyDest;
      const resolution = resolveRequestLocale(request);
      if (!resolution.ok) {
        return localeErrorResponse(request, resolution, "html");
      }
      return temporaryLocaleRedirect(
        request,
        withLang(dest.toString(), resolution.lang),
        resolution.lang
      );
    }

    return withSsrLocaleResponse(
      request,
      await withRouteIndexabilityHeaders(
        request,
        handlePublicCors(request, () =>
          handleSubscribeCors(request, async () =>
            withHomepageHeaders(
              request,
              applyNotFoundHttpStatus(await handler.fetch(request))
            )
          )
        )
      )
    );
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await tickIngest(env);
  },
};

export { NewsIngestScheduler, NewsIngestWorkflow };
