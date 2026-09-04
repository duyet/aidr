import { createFileRoute } from "@tanstack/react-router";
import { extensionReleasePayload } from "../../lib/extension-release";
import { PUBLIC_CACHE_CONTROL } from "../../lib/public-api";

type HandlerArgs = { request: Request; context: any };

export const Route = createFileRoute("/api/extension")({
  server: {
    handlers: {
      GET: async (_args: HandlerArgs) => {
        return Response.json(extensionReleasePayload(), {
          headers: { "Cache-Control": PUBLIC_CACHE_CONTROL },
        });
      },
    },
  },
});
