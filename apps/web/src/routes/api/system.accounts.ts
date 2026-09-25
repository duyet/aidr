import { createFileRoute } from "@tanstack/react-router";
import { loadClerkAccountCount } from "../../../worker/account-count.js";
import { ACCOUNTS_CACHE_CONTROL, resolveWorkerEnv } from "../../lib/system-api";

/**
 * Aggregate AIDR signups/accounts from the D1 `clerk_users` mirror, fed by a
 * verified Clerk webhook (and the admin backfill). One indexed COUNT, no live
 * Clerk Admin call on a page load. The response contains no user records and no
 * upstream error text: an unmirrored database is `unconfigured`, a read failure
 * is `error`, and neither is ever rendered as 0.
 */
export const Route = createFileRoute("/api/system/accounts")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) => {
        try {
          const env = await resolveWorkerEnv(context);
          const data = await loadClerkAccountCount(env?.DB);
          return Response.json(data, {
            headers: {
              "Cache-Control":
                data.status === "available"
                  ? ACCOUNTS_CACHE_CONTROL
                  : "no-store",
            },
          });
        } catch {
          return Response.json(
            { error: "account count unavailable" },
            { status: 500, headers: { "Cache-Control": "no-store" } }
          );
        }
      },
    },
  },
});
