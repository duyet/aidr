import { createFileRoute } from "@tanstack/react-router";
import { systemHandler } from "../../lib/system-api";
import { loadSystemSources } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system/sources")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "sources", loadSystemSources),
    },
  },
});
