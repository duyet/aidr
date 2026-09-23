import { createFileRoute } from "@tanstack/react-router";
import { systemDb, systemJson } from "../../lib/system-api";
import { loadRunAttempts } from "../../lib/system-queries";

const MAX_WINDOW_MS = 6 * 3600_000;

export const Route = createFileRoute("/api/system/run-attempts")({
  server: {
    handlers: {
      GET: async ({ request, context }: { request: Request; context: any }) => {
        const url = new URL(request.url);
        const since = Number(url.searchParams.get("since"));
        const until = Number(url.searchParams.get("until"));
        if (
          !Number.isFinite(since) ||
          !Number.isFinite(until) ||
          until <= since ||
          until - since > MAX_WINDOW_MS
        ) {
          return Response.json({ error: "bad window" }, { status: 400 });
        }
        const db = await systemDb(context);
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        try {
          const attempts = await loadRunAttempts(
            db,
            since,
            Math.min(until, Date.now() + 60_000)
          );
          return systemJson({ attempts });
        } catch (e) {
          console.error("system/run-attempts:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
