import { createFileRoute } from "@tanstack/react-router";
import { extensionReleasePayload } from "../../lib/extension-release";
import { PUBLIC_CACHE_CONTROL } from "../../lib/public-api";
import { fetchLatestAidrRelease } from "../../../worker/extension-zip";

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
              // Stable site URL — Worker redirects to the release asset.
              zip: base.zip,
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
