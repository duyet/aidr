import handler from "@tanstack/react-start/server-entry";
import { aliasRedirect } from "../worker/alias-redirect";
import { handleClerkProxy, isClerkProxyPath } from "../worker/clerk-proxy";
import { handleAidrZipRequest } from "../worker/extension-zip";
import { ensureIngestAlarm, tickIngest } from "../worker/ingest-schedule";
import { NewsIngestScheduler } from "../worker/ingest-scheduler";
import { handlePublicCors } from "../worker/public-cors";
import { handleSubscribeCors } from "../worker/subscribe/cors";
import type { Env } from "../worker/types";
import { NewsIngestWorkflow } from "../worker/workflow";
import {
  handleAgentDiscovery,
  withHomepageLinkHeaders,
} from "./lib/agent-discovery";
import { llmsTxtResponse } from "./lib/llms-txt";
import { applyNotFoundHttpStatus } from "./lib/not-found-status";
import {
  buildSitemapXml,
  loadSitemapUrls,
  robotsResponse,
  safeSitemapResponse,
  sitemapResponse,
  staticSitemapUrls,
} from "./lib/sitemap";

async function resolveEnv(env?: Env): Promise<Env | undefined> {
  if (env?.DB) return env;
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as Env;
  } catch {
    return env;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext) {
    const alias = aliasRedirect(request);
    if (alias) return alias;
    const path = new URL(request.url).pathname;
    if (isClerkProxyPath(path)) {
      return handleClerkProxy(request, env);
    }
    if (path === "/aidr.zip") {
      return handleAidrZipRequest(request);
    }
    if (
      path === "/api/public" ||
      path === "/api/admin/ingest" ||
      path === "/api/system"
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
            ? loadSitemapUrls(resolved.DB)
            : staticSitemapUrls();
        });
      } catch (error) {
        console.error("sitemap.xml failed; serving static fallback", error);
        return sitemapResponse(buildSitemapXml(staticSitemapUrls()));
      }
    }
    return handlePublicCors(request, () =>
      handleSubscribeCors(request, async () =>
        withHomepageLinkHeaders(
          request,
          applyNotFoundHttpStatus(await handler.fetch(request))
        )
      )
    );
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await tickIngest(env);
  },
};

export { NewsIngestScheduler, NewsIngestWorkflow };
