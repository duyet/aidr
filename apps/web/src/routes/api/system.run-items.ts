import { createFileRoute } from "@tanstack/react-router";
import { systemDb, systemJson } from "../../lib/system-api";
import { loadRunItems } from "../../lib/system-queries";
import { parseRunIdParam } from "./system.run-attempts";

export const Route = createFileRoute("/api/system/run-items")({
  server: {
    handlers: {
      GET: async ({ request, context }: { request: Request; context: any }) => {
        const url = new URL(request.url);
        const runId = parseRunIdParam(url.searchParams.get("run_id"));
        if (!runId) {
          return Response.json({ error: "run_id required" }, { status: 400 });
        }
        const db = await systemDb(context);
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        try {
          return systemJson(await loadRunItems(db, runId), "no-store");
        } catch (e) {
          console.error("system/run-items:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
