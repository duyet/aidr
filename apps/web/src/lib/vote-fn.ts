import { createServerFn } from "@tanstack/react-start";
import { requireClerkUser } from "./clerk-auth-fn";

export interface CastVoteResult {
  myVote: -1 | 0 | 1;
  voteNet: number;
  rankScore: number;
}

export interface ReaderVotesResult {
  votes: Record<string, -1 | 1>;
  nets: Record<string, number>;
}

function storyId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8,64}$/.test(id)) {
    throw new Error("Invalid story");
  }
  return id;
}

export const castStoryVote = createServerFn({ method: "POST" })
  .inputValidator((input: { item_id: string; value: 1 | -1 }) => {
    if (input?.value !== 1 && input?.value !== -1) {
      throw new Error("Invalid vote");
    }
    return { item_id: storyId(input.item_id), value: input.value };
  })
  .handler(async ({ data }): Promise<CastVoteResult> => {
    const { userId } = await requireClerkUser();
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) throw new Error("D1 binding DB not configured");
    const { applyVote } = await import("../../worker/votes.js");
    const result = await applyVote(db, {
      itemId: data.item_id,
      userId,
      value: data.value,
    });
    if (!result.ok) throw new Error(result.error);
    return {
      myVote: result.myVote,
      voteNet: result.voteNet,
      rankScore: result.rankScore,
    };
  });

export const fetchMyVotes = createServerFn({ method: "GET" })
  .inputValidator((input: { ids: string[] }) => {
    if (!Array.isArray(input?.ids) || input.ids.length > 90) {
      throw new Error("Invalid stories");
    }
    return { ids: input.ids.map(storyId) };
  })
  .handler(async ({ data }): Promise<ReaderVotesResult> => {
    const { userId } = await requireClerkUser();
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return { votes: {}, nets: {} };
    const { listReaderVotes } = await import("../../worker/votes.js");
    return listReaderVotes(db, userId, data.ids);
  });
