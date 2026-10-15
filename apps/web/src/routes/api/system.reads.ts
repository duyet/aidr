import { createFileRoute } from "@tanstack/react-router";
import { loadSystemReads } from "../../lib/reads-query";
import { systemHandler, TRENDS_CACHE_CONTROL } from "../../lib/system-api";

export const Route = createFileRoute("/api/system/reads")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "reads", loadSystemReads, {
          cacheControl: TRENDS_CACHE_CONTROL,
        }),
    },
  },
});
