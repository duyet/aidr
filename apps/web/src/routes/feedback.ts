import { createFileRoute } from "@tanstack/react-router";
import { handleFeedbackRequest } from "../../worker/mail/feedback.js";
import type { Env } from "../../worker/types.js";
import { resolveWorkerEnv } from "../lib/system-api";

type HandlerArgs = { request: Request; context: any };

/** One-click "Was today's edition useful?" from the digest mail. */
export const Route = createFileRoute("/feedback")({
  server: {
    handlers: {
      GET: async ({ request, context }: HandlerArgs) => {
        const env = (await resolveWorkerEnv(context)) as Env | undefined;
        if (!env?.DB) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        return handleFeedbackRequest(env, new URL(request.url));
      },
    },
  },
});
