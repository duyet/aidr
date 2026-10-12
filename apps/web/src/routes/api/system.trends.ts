import { createFileRoute } from "@tanstack/react-router";
import { systemHandler, TRENDS_CACHE_CONTROL } from "../../lib/system-api";
import { loadSystemTrends } from "../../lib/trends-query";

export const Route = createFileRoute("/api/system/trends")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "trends", loadSystemTrends, {
          cacheControl: TRENDS_CACHE_CONTROL,
        }),
    },
  },
});
