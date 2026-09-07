import { createFileRoute } from "@tanstack/react-router";
import { fetchLatestAidrRelease } from "../../../worker/extension-zip";
import { extensionReleasePayload } from "../../lib/extension-release";
import { PUBLIC_CACHE_CONTROL } from "../../lib/public-api";

type HandlerArgs = { request: Request; context: any };

export const Route = createFileRoute("/api/extension")({
  server: {
    handlers: {
      GET: async (_args: HandlerArgs) => {
        const base = extensionReleasePayload();
        const latest = await fetchLatestAidrRelease();
        const body = latest
          ? {
              ...base,
              version: latest.version,
              tag: latest.tag,
            }
          : base;
        return Response.json(body, {
          headers: { "Cache-Control": PUBLIC_CACHE_CONTROL },
        });
      },
    },
  },
});
