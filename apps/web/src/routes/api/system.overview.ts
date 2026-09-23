import { createFileRoute } from "@tanstack/react-router";
import { systemHandler } from "../../lib/system-api";
import { loadSystemOverview } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system/overview")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "overview", loadSystemOverview),
    },
  },
});
