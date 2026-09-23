import { createFileRoute } from "@tanstack/react-router";
import { systemHandler } from "../../lib/system-api";
import { loadSystemLlm } from "../../lib/system-queries";

export const Route = createFileRoute("/api/system/llm")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "llm", loadSystemLlm),
    },
  },
});
