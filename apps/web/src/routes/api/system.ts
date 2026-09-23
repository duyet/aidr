import { createFileRoute } from "@tanstack/react-router";
import { resolveWorkerEnv, systemJson } from "../../lib/system-api";
import { loadSystemStats } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) => {
        const env = await resolveWorkerEnv(context);
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }

        try {
          // first-primary: the GitHub Actions watchdog polls this endpoint
          // for lastRun right after ingest, so it must see fresh primary
          // state even once read replication is on. The granular
          // /api/system/* endpoints serve the /data UI without the pin.
          const session =
            typeof db.withSession === "function"
              ? db.withSession("first-primary")
              : db;
          const stats = await loadSystemStats(session as D1Database, env);
          return systemJson(stats);
        } catch (e) {
          console.error("system:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
