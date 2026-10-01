import { createServerFn } from "@tanstack/react-start";
import type { ContributorEmail } from "../../worker/email-intake/aliases.js";
import type { Env } from "../../worker/types.js";
import { requireClerkUser } from "./clerk-auth-fn";
import { SITE_URL } from "./site";

async function workerEnv(): Promise<Env> {
  const { env } = await import("cloudflare:workers");
  const typed = env as unknown as Env;
  if (!typed.DB) throw new Error("D1 binding DB not configured");
  return typed;
}

/** The signed-in user's extra contribution addresses. */
export const fetchContributorEmails = createServerFn({ method: "GET" }).handler(
  async (): Promise<ContributorEmail[]> => {
    const { userId } = await requireClerkUser();
    const env = await workerEnv();
    const { listContributorEmails } = await import(
      "../../worker/email-intake/aliases.js"
    );
    return listContributorEmails(env.DB, userId);
  }
);

/** Adds an address and mails it a confirmation link. */
export const addContributorEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => input)
  .handler(async ({ data }) => {
    const { userId } = await requireClerkUser();
    if (typeof data.email !== "string") throw new Error("Enter a valid email");
    const env = await workerEnv();
    const { addContributorEmail } = await import(
      "../../worker/email-intake/aliases.js"
    );
    const result = await addContributorEmail(env, userId, data.email, SITE_URL);
    if (!result.ok) throw new Error(result.error);
    return { ok: true as const };
  });

export const removeContributorEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { userId } = await requireClerkUser();
    if (typeof data.id !== "string" || !data.id) throw new Error("Missing id");
    const env = await workerEnv();
    const { removeContributorEmail } = await import(
      "../../worker/email-intake/aliases.js"
    );
    return { removed: await removeContributorEmail(env.DB, userId, data.id) };
  });
