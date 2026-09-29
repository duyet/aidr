import { createFileRoute } from "@tanstack/react-router";
import { systemHandler } from "../../lib/system-api";
import { loadSystemRuns } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system/runs")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        // Per-run usage is aggregated in SQL, so this stays small and exact
        // regardless of call volume. Attempts stay out of the list payload —
        // they are the bulk of the old 1.2MB body. Rows fetch
        // /api/system/run-attempts on expand.
        systemHandler(context, "runs", async (db) => ({
          runs: await loadSystemRuns(db),
        })),
    },
  },
});
