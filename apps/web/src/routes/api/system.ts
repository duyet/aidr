import { createFileRoute } from "@tanstack/react-router";
import { loadSystemStats } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) => {
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
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }

        try {
          const session =
            typeof db.withSession === "function"
              ? db.withSession("first-primary")
              : db;
          const stats = await loadSystemStats(session as D1Database, env);
          return Response.json(stats, {
            headers: {
              // Short edge cache: /api/system fans out to ~15 D1 queries per
              // hit and the /data shell fetches it on every visit, but
              // lastRun/runsToday recert must still observe a finished ingest
              // within ~30s (a 5-minute cache once hid completion). Ingest
              // runs hourly, so this staleness is invisible in practice.
              "Cache-Control":
                "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
            },
          });
        } catch (e) {
          console.error("system:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
