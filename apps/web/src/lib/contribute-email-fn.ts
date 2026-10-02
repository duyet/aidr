import { createServerFn } from "@tanstack/react-start";
import type { Env } from "../../worker/types.js";
import { requireClerkUser } from "./clerk-auth-fn";

async function workerEnv(): Promise<Env> {
  const { env } = await import("cloudflare:workers");
  const typed = env as unknown as Env;
  if (!typed.DB) throw new Error("D1 binding DB not configured");
  return typed;
}

/** Addresses Clerk has already verified for the signed-in account. */
export const fetchContributorEmails = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { userId } = await requireClerkUser();
    const env = await workerEnv();
    const { listVerifiedEmails } = await import("../../worker/clerk-users.js");
    return listVerifiedEmails(env.DB, userId);
  }
);
