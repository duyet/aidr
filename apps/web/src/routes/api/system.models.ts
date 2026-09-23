import { createFileRoute } from "@tanstack/react-router";
import {
  MODELS_CACHE_CONTROL,
  resolveWorkerEnv,
  systemJson,
} from "../../lib/system-api";
import { getModelChains } from "../../lib/system-queries";

/** Model fallback chains come from env vars — no DB round-trip, so this
 * endpoint answers in ~ms and backs the /data header chips, the algo tab,
 * and the /about transparency line. */
export const Route = createFileRoute("/api/system/models")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) => {
        const env = await resolveWorkerEnv(context);
        return systemJson(
          { models: getModelChains(env ?? {}) },
          MODELS_CACHE_CONTROL
        );
      },
    },
  },
});
