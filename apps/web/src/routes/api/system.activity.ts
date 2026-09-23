import { createFileRoute } from "@tanstack/react-router";
import { systemHandler } from "../../lib/system-api";
import { loadSystemActivity } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system/activity")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "activity", loadSystemActivity),
    },
  },
});
