import { createFileRoute } from "@tanstack/react-router";
import { loadClerkAccountCount } from "../../../worker/account-count.js";
import { ACCOUNTS_CACHE_CONTROL, resolveWorkerEnv } from "../../lib/system-api";

/**
 * Aggregate AIDR signups/accounts from Clerk, the authoritative user
 * directory. The response contains no user records or upstream error text.
 */
export const Route = createFileRoute("/api/system/accounts")({
  server: {
    handlers: {
      GET: async ({ context }: { context: any }) => {
        try {
          const env = await resolveWorkerEnv(context);
          const data = await loadClerkAccountCount(env ?? {});
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
