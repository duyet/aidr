import { createFileRoute } from "@tanstack/react-router";
import { loadAudienceStats } from "../../lib/audience-queries";
import { AUDIENCE_CACHE_CONTROL, systemHandler } from "../../lib/system-api";

/**
 * Audience metrics for the /data Audience tab: GA4 page views / DAU / MAU
 * from the last stored snapshot, plus live subscriber counts by signup
 * source, language, and digest size.
 *
 * Public and cacheable: the payload is aggregate counters with no email
 * addresses, query strings, or user identifiers. A GA4 property that has
 * never been synced reports `unconfigured` rather than zero.
 */
export const Route = createFileRoute("/api/system/audience")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) =>
        systemHandler(context, "audience", loadAudienceStats, {
          cacheControl: AUDIENCE_CACHE_CONTROL,
        }),
    },
  },
});
