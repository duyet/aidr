import { createServerFn } from "@tanstack/react-start";
import type { Env } from "../../worker/types.js";
import { requireClerkUser } from "./clerk-auth-fn";

async function workerEnv(): Promise<Env> {
  const { env } = await import("cloudflare:workers");
  const typed = env as unknown as Env;
  if (!typed.DB) throw new Error("D1 binding DB not configured");
  return typed;
}

export const fetchContributorEmails = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { userId } = await requireClerkUser();
    const env = await workerEnv();
    const { listVerifiedEmails } = await import("../../worker/clerk-users.js");
    return listVerifiedEmails(env.DB, userId);
  }
);

/** Re-reads the signed-in account from Clerk, then returns its verified
 *  addresses. Called after the reader verifies a new address, so the email
 *  Worker accepts it without waiting for the webhook. `synced` is false when
 *  Clerk could not be reached; the list is then whatever D1 already holds. */
export const syncContributorEmails = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ emails: string[]; synced: boolean }> => {
  const { userId } = await requireClerkUser();
  const env = await workerEnv();
  const { listVerifiedEmails, syncClerkUserById } = await import(
    "../../worker/clerk-users.js"
  );
  const status = await syncClerkUserById(env, userId);
  return {
    emails: await listVerifiedEmails(env.DB, userId),
    synced: status === "ok",
  };
});
