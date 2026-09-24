import { createFileRoute } from "@tanstack/react-router";
import { systemDb, systemJson } from "../../lib/system-api";
import { loadRunAttempts } from "../../lib/system-queries";

const UUID_RUN_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFIXED_RUN_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

export function parseRunIdParam(value: string | null): string | null {
  if (
    !value ||
    (!UUID_RUN_ID_RE.test(value) && !PREFIXED_RUN_ID_RE.test(value))
  ) {
    return null;
  }
  return value;
}

export const Route = createFileRoute("/api/system/run-attempts")({
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
          return systemJson(await loadRunAttempts(db, runId));
        } catch (e) {
          console.error("system/run-attempts:", e);
          return Response.json({ error: "query failed" }, { status: 500 });
        }
      },
    },
  },
});
