import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type {
  ContributionCursor,
  ContributionPage,
  SuggestionStatusView,
} from "../../worker/contributions.js";
import type { Env } from "../../worker/types.js";
import { requireClerkUser } from "./clerk-auth-fn";
import { readSession } from "./db";

export interface SuggestionSummary {
  user_name: string;
  status: "pending" | "reviewing" | "accepted" | "needs_review" | "rejected";
  created_at: number;
  suggestion: string | null;
}

export interface SuggestionInput {
  item_id: string;
  field: "title" | "summary";
  /** Language of the displayed text being edited; defaults to `vi`. */
  lang?: "vi" | "en";
  suggestion: string;
  user_id?: string;
  user_name?: string;
  via?: "web" | "agent";
}

const MAX_LEN = 2000;

export function validateSuggestion(input: SuggestionInput): string {
  const suggestion = input.suggestion.trim();
  if (!suggestion) throw new Error("Suggestion cannot be empty");
  if (suggestion.length > MAX_LEN) {
    throw new Error(`Suggestion must be ${MAX_LEN} characters or fewer`);
  }
  if (input.field !== "title" && input.field !== "summary") {
    throw new Error("Invalid field");
  }
  if (input.lang !== undefined && input.lang !== "vi" && input.lang !== "en") {
    throw new Error("Invalid lang");
  }
  if (!input.item_id) throw new Error("Missing item_id");
  if (!input.user_id) throw new Error("Sign in required");
  if (input.via !== undefined && input.via !== "web" && input.via !== "agent") {
    throw new Error("Invalid via");
  }
  return suggestion;
}

export const submitSuggestion = createServerFn({ method: "POST" })
  .inputValidator((input: SuggestionInput) => input)
  .handler(async ({ data }) => {
    const { userId, userName } = await requireClerkUser();
    const { env, waitUntil } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) throw new Error("D1 binding DB not configured");

    const { submitAndReviewSuggestion } = await import(
      "../../worker/suggestions.js"
    );
    const ip = getRequest().cf
      ? (getRequest().headers.get("CF-Connecting-IP") ?? null)
      : null;
    // Reviewed right away, after the response is sent. The hourly
    // review-suggestions step picks up anything this does not finish.
    const result = await submitAndReviewSuggestion(
      env as unknown as Env,
      {
        itemId: data.item_id,
        field: data.field,
        lang: data.lang,
        suggestion: data.suggestion,
        userId,
        userName,
        ip: ip ?? undefined,
      },
      waitUntil
    );
    if (!result.ok) throw new Error(result.error);
    return { id: result.id };
  });

/** Polled by the suggest form until the verdict lands. Owner-only: the
 *  user comes from the Clerk session, and another user's id reads as null. */
export const fetchSuggestionStatus = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<SuggestionStatusView | null> => {
    const { userId } = await requireClerkUser();
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db || typeof data.id !== "string" || !data.id) return null;
    const { getOwnSuggestion } = await import("../../worker/contributions.js");
    // Primary, not readSession: a replica could still say "reviewing".
    return getOwnSuggestion(db, userId, data.id);
  });

/** The signed-in user's suggestions and submissions, newest first. */
export const fetchMyContributions = createServerFn({ method: "GET" })
  .inputValidator((input: { before?: ContributionCursor | null }) => input)
  .handler(async ({ data }): Promise<ContributionPage> => {
    const { userId } = await requireClerkUser();
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return { items: [], next: null };
    const { listContributions } = await import("../../worker/contributions.js");
    const before =
      data.before &&
      typeof data.before.created_at === "number" &&
      typeof data.before.id === "string"
        ? data.before
        : null;
    return listContributions(db, userId, { before });
  });

export const fetchSuggestions = createServerFn({ method: "GET" })
  .inputValidator((input: { item_id: string }) => input)
  .handler(async ({ data }): Promise<SuggestionSummary[]> => {
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return [];
    try {
      const { results } = await readSession(db)
        .prepare(
          `SELECT user_name, status, created_at,
                  CASE WHEN status = 'accepted' THEN suggestion ELSE NULL END AS suggestion
           FROM translation_suggestions
           WHERE item_id = ?
           ORDER BY created_at DESC
           LIMIT 50`
        )
        .bind(data.item_id)
        .all<SuggestionSummary>();
      return results ?? [];
    } catch {
      return [];
    }
  });
