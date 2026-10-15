import { createFileRoute } from "@tanstack/react-router";
import { loadSystemMailStats } from "../../lib/mail-stats-query";
import { systemHandler, TRENDS_CACHE_CONTROL } from "../../lib/system-api";

export const Route = createFileRoute("/api/system/mail-stats")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "mail-stats", loadSystemMailStats, {
          cacheControl: TRENDS_CACHE_CONTROL,
        }),
    },
  },
});
