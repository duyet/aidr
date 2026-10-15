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
import {
  handleDayMarkdownRequest,
  isDayMarkdownPath,
} from "./lib/day-markdown";
import { readSession } from "./lib/db";
import {
  bareLocalizedCacheLang,
  cachedLocaleResponse,
  cachedSsrResponse,
} from "./lib/edge-cache";
import {
  handleHomeMarkdownRequest,
  isHomeMarkdownPath,
} from "./lib/home-markdown";
import { llmsFullTxtResponse, llmsTxtResponse } from "./lib/llms-txt";
import {
  apiErrorResponse,
  LOCALE_PRIVATE_CACHE_CONTROL,
  LOCALE_VARY,
  localeErrorResponse,
  normalizeLocaleRequest,
  permanentLocaleRedirect,
  resolveApiRequestLocale,
  resolveRequestLocale,
  resolveServerFnLocaleRequest,
  SSR_LOCALIZED_CACHE_CONTROL,
  temporaryLocaleRedirect,
  withSsrLocaleResponse,
} from "./lib/locale-response";
import {
  isLanguageNeutralSsrPath,
  isLocaleAwareApiPath,
  isPrivateSsrPath,
} from "./lib/locale-routing";
import { withLang } from "./lib/locale-url";
import {
  markdownAlternateLink,
  negotiableMarkdownPath,
  prefersMarkdown,
  storyMarkdownAliasPath,
  withAcceptVary,
} from "./lib/markdown-negotiation";
import {
  loadNewsSitemapEntries,
  safeNewsSitemapResponse,
} from "./lib/news-sitemap";
import { applyNotFoundHttpStatus } from "./lib/not-found-status";
import { withRouteIndexabilityHeaders } from "./lib/route-indexability";
import { handleFeedXmlRequest, RSS_CACHE_CONTROL } from "./lib/rss";
import { classifyServerFnPath } from "./lib/server-fn-registry";
import { isServerFnBasePath, isServerFnPath } from "./lib/server-fn-request";
import { NEWS_SITEMAP_PATH, RSS_ALIAS_PATH, RSS_FEED_PATH } from "./lib/site";
import {
  buildSitemapIndexXml,
  buildSitemapXml,
  loadDaySitemapUrls,
  loadSitemapMonthCounts,
  loadSitemapShardUrls,
  parseSitemapShardPath,
  robotsResponse,
  SITEMAP_DAYS_CHILD_PATH,
  SITEMAP_STATIC_CHILD_PATH,
  safeSitemapIndexResponse,
  safeSitemapResponse,
  sitemapIndexEntries,
  sitemapResponse,
  staticSitemapUrls,
} from "./lib/sitemap";
import { legacyStoryRedirectPath } from "./lib/slug";
import { withSsrHead } from "./lib/ssr-head";
import {
  handleStoryMarkdownRequest,
  isStoryMarkdownPath,
} from "./lib/story-markdown";
import {
  handleWeekMarkdownRequest,
  isWeekMarkdownPath,
} from "./lib/week-markdown";

async function resolveEnv(env?: Env): Promise<Env | undefined> {
  if (env?.DB) return env;
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as Env;
  } catch {
    return env;
  }
}

/** The D1 binding, or undefined outside the Workers runtime (tests, scripts). */
async function resolveDb(env?: Env): Promise<D1Database | undefined> {
  return (await resolveEnv(env))?.DB;
}

/** Retired page paths and where they moved. Each is a locale-safe 301
 *  (307 when the request carries an explicit locale, see below), mirrored
 *  in-app by the matching route's `beforeLoad` for client navigations. */
const LEGACY_PAGE_REDIRECTS: Record<string, string | undefined> = {
  "/extension": "/subscribe",
  "/changelog": "/release",
};

/** The same request at another path, keeping its query and headers. */
function atPath(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

async function serveMarkdown(
  request: Request,
  path: string,
  env: Env
): Promise<Response | null> {
  if (isStoryMarkdownPath(path)) {
    return handleStoryMarkdownRequest(request, env?.DB);
  }
  if (isDayMarkdownPath(path)) {
    return handleDayMarkdownRequest(request, await resolveDb(env));
  }
  if (isWeekMarkdownPath(path)) {
    return handleWeekMarkdownRequest(request, await resolveDb(env));
  }
  if (isHomeMarkdownPath(path)) {
    return handleHomeMarkdownRequest(request, await resolveDb(env));
  }
  return null;
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
    // Markdown twins are generated from sanitized D1 rows only; they never
    // fetch external Markdown. They run ahead of the SPA catch-all, and a
    // negotiated one also ahead of both caches (see markdown-negotiation).
    const direct = await serveMarkdown(request, path, env);
    if (direct) return direct;
    const storyAlias = storyMarkdownAliasPath(path);
    if (storyAlias) {
      return handleStoryMarkdownRequest(atPath(request, storyAlias), env?.DB);
    }
    const markdownTwin = negotiableMarkdownPath(path);
    if (markdownTwin && prefersMarkdown(request.headers.get("Accept"))) {
      const negotiated = await serveMarkdown(
        atPath(request, markdownTwin),
        markdownTwin,
        env
      );
      if (negotiated) return withAcceptVary(negotiated);
    }
    if (path === "/favicon.ico") {
      // public/favicon.ico is a real multi-size ICO and handlePublicAsset
      // already served it above, so this only runs when the assets binding is
      // unavailable. Keep the root-convention request on an image rather than
      // 404ing into the SPA shell (console noise, and crawlers read HTML as a
      // broken icon).
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
    if (path === "/llms-full.txt") {
      return llmsFullTxtResponse(await resolveDb(env));
    }
    const discovery = await handleAgentDiscovery(request);
    if (discovery) return discovery;

    // Discovery surfaces are Worker-owned and run before the SPA catch-all.
    // `/sitemap.xml` is a <sitemapindex> now: one static child, one child per
    // UTC month of publication, the day archive child, and the news sitemap. Every child keeps the
    // fail-closed contract — 200 valid XML, static-only on a D1 error.
    if (path === "/sitemap.xml") {
      try {
        return await safeSitemapIndexResponse(async () => {
          const db = await resolveDb(env);
          return db ? loadSitemapMonthCounts(readSession(db)) : [];
        });
      } catch (error) {
        console.error("sitemap.xml failed; serving static index", error);
        return sitemapResponse(
          buildSitemapIndexXml(sitemapIndexEntries([], Date.now()))
        );
      }
    }
    if (path === SITEMAP_STATIC_CHILD_PATH) {
      return sitemapResponse(buildSitemapXml(staticSitemapUrls()));
    }
    if (path === SITEMAP_DAYS_CHILD_PATH) {
      return safeSitemapResponse(async () => {
        const db = await resolveDb(env);
        return db ? loadDaySitemapUrls(readSession(db)) : [];
      });
    }
    const shard = parseSitemapShardPath(path);
    if (shard) {
      return safeSitemapResponse(async () => {
        const db = await resolveDb(env);
        return db ? loadSitemapShardUrls(readSession(db), shard) : [];
      });
    }
    if (path === NEWS_SITEMAP_PATH) {
      return safeNewsSitemapResponse(async () => {
        const db = await resolveDb(env);
        return db ? loadNewsSitemapEntries(db) : [];
      });
    }
    // RSS 2.0. One locale gate (identical to /api/feed), one loader, bounded.
    // `/rss.xml` serves the identical document for readers that hardcode it;
    // `<atom:link rel="self">` always advertises `/feed.xml` as canonical.
    if (path === RSS_FEED_PATH || path === RSS_ALIAS_PATH) {
      const feedLocale = resolveApiRequestLocale(request);
      if (!feedLocale.ok) return feedLocale.response;
      return cachedLocaleResponse(
        request,
        ctx,
        feedLocale.locale.lang,
        RSS_CACHE_CONTROL,
        async () => handleFeedXmlRequest(request, await resolveDb(env))
      );
    }
    // `/feed.json` is a thin alias of the existing JSON feed: same route
    // handler, same bounds, same document. It adds no new JSON format, so it
    // resolves here — before the document locale gate, which would answer a
    // malformed `lang` with an HTML error page instead of the API's JSON 400.
    if (path === "/feed.json") {
      const aliasLocale = resolveApiRequestLocale(request);
      if (!aliasLocale.ok) return aliasLocale.response;
      const target = new URL(request.url);
      target.pathname = "/api/feed";
      return handler.fetch(new Request(target.toString(), request));
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
    // document gate's 307 or HTML error page. A path that names no real
    // function is answered here too: Start would throw an unhandled error
    // whose message echoes the requested id.
    if (isServerFnPath(path) || isServerFnBasePath(path)) {
      const verdict = await classifyServerFnPath(path);
      if (verdict === "malformed" || verdict === "unknown") {
        return apiErrorResponse(404, {
          error: "server_function_not_found",
          message: "Unknown server function.",
          message_vi: "Không tìm thấy hàm máy chủ.",
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
        redirectPath: LEGACY_PAGE_REDIRECTS[path],
        allowRedirect: isApi || htmlRequest,
      });
      if (normalized) {
        return isApi ? handlePublicCors(request, () => normalized) : normalized;
      }
    }

    const legacyDest = LEGACY_PAGE_REDIRECTS[path];
    if (legacyDest && htmlRequest) {
      const dest = new URL(request.url);
      dest.pathname = legacyDest;
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
      // 308, not 307: the category prefix is a permanent permutation of the
      // documented `/{8-hex}` canonical, so crawlers must consolidate onto it
      // instead of re-checking the old address (issue #223). The target is
      // still written in one hop, so no chain: `legacyStoryRedirectPath`
      // returns the `/{8-hex}` form, and the locale gate above has already
      // normalized `locale=` to `lang=`.
      return permanentLocaleRedirect(
        request,
        withLang(dest.toString(), resolution.lang),
        resolution.lang
      );
    }

    const renderSsr = async () =>
      withSsrLocaleResponse(
        request,
        await withRouteIndexabilityHeaders(
          request,
          handlePublicCors(request, () =>
            handleSubscribeCors(request, async () =>
              withHomepageHeaders(
                request,
                withSsrHead(
                  request,
                  applyNotFoundHttpStatus(await handler.fetch(request)),
                  env.ASSETS
                )
              )
            )
          )
        )
      );
    // Localized pages without `?lang=` (bare `/`, `/{8-hex}`) pick the
    // language from Cookie/Accept-Language, so they stay private to clients;
    // the Worker cache still keys them by the resolved language.
    const bareLocale = bareLocalizedCacheLang(request);
    const html = bareLocale
      ? await cachedLocaleResponse(
          request,
          ctx,
          bareLocale,
          SSR_LOCALIZED_CACHE_CONTROL,
          renderSsr
        )
      : await cachedSsrResponse(request, ctx, renderSsr);
    // After both caches: an inner-cache hit is stored without Vary.
    if (!markdownTwin) return html;
    return withAcceptVary(
      html,
      html.status === 200
        ? markdownAlternateLink(markdownTwin, new URL(request.url).search)
        : undefined
    );
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await tickIngest(env);
  },
};

export { NewsIngestScheduler, NewsIngestWorkflow };
