import { createFileRoute } from "@tanstack/react-router";
import { readPrimarySession } from "../../lib/db";
import { getFeedFreshness } from "../../lib/feed-freshness";
import { classifyRunHealth, type RunHealth } from "../../lib/run-health";
import { resolveWorkerEnv } from "../../lib/system-api";

/**
 * Read-only pipeline health for an external uptime monitor. HTTP 200 while
 * the newest run is `ok` or `degraded`, 503 when `down` (failed, or no run
 * in 6h), so a plain status-code check is enough. Body is the same footer
 * run summary plus the newest published item time.
 */
export const HEALTH_CACHE_CONTROL = "public, max-age=30, s-maxage=60";

type HealthHandlerArgs = { context: any };

export interface HealthBody {
  status: RunHealth;
  checkedAt: number;
  lastFetchedAt: number | null;
  latestRun: Awaited<ReturnType<typeof getFeedFreshness>>["latestRun"] | null;
}

export async function healthHandler({
  context,
}: HealthHandlerArgs): Promise<Response> {
  const checkedAt = Math.floor(Date.now() / 1000);
  try {
    const env = await resolveWorkerEnv(context);
    const db: D1Database | undefined = env?.DB;
    if (!db) throw new Error("D1 binding DB not configured");
    const freshness = await getFeedFreshness(readPrimarySession(db));
    const latestRun = freshness.latestRun ?? null;
    const status = classifyRunHealth(latestRun, checkedAt);
    const body: HealthBody = {
      status,
      checkedAt,
      lastFetchedAt: freshness.lastFetchedAt,
      latestRun,
    };
    return Response.json(body, {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": HEALTH_CACHE_CONTROL },
    });
  } catch (e) {
    console.error("health:", e);
    return Response.json(
      { status: "down", checkedAt, error: "health query failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: healthHandler,
    },
  },
});
