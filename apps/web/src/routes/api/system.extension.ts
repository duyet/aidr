import { createFileRoute } from "@tanstack/react-router";
import { loadSystemExtEvents } from "../../lib/ext-events-query";
import { systemHandler, TRENDS_CACHE_CONTROL } from "../../lib/system-api";

export const Route = createFileRoute("/api/system/extension")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "extension", loadSystemExtEvents, {
          cacheControl: TRENDS_CACHE_CONTROL,
        }),
    },
  },
});
