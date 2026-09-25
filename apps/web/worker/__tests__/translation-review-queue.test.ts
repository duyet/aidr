import { describe, expect, it } from "vitest";
import {
  listTranslationReviewQueue,
  resolveTranslationReview,
} from "../translation-review-queue.js";
import type { Env } from "../types.js";

function makeDb(
  options: { changes?: number[]; state?: Record<string, unknown> | null } = {}
) {
  const writes: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        sql,
        boundArgs: args,
        bind(...next: unknown[]) {
          args = next;
          statement.boundArgs = next;
          return statement;
        },
        async all<T>() {
          if (sql.includes("FROM translation_review_state")) {
            return {
              results: [
                {
                  state_id: "state-1",
                  attempt_id: "attempt-1",
                  item_id: "item-1",
                  lang: "vi",
                  source_lang: "en",
                  target_lang: "vi",
                  direction: "en-vi",
                  source_revision: 2,
                  source_hash: "source-hash",
                  candidate_hash: "candidate-hash",
                  attempt_count: 1,
                  manual_retry_count: 0,
                  next_retry_at: null,
                  source_title: "Source",
                  source_summary: "Summary",
                  candidate_title: "Candidate",
                  candidate_summary: "Summary",
                  decision: "human_review",
                  reason: "needs review",
                  updated_at: 10,
                } as T,
              ],
            };
          }
          return { results: [] as T[] };
        },
        async first<T>() {
          return (
            options.state === undefined
              ? {
                  state_id: "state-1",
                  attempt_id: "attempt-1",
                  terminal: 1,
                  item_id: "item-1",
                  lang: "vi",
                  source_lang: "en",
                  target_lang: "vi",
                  direction: "en-vi",
                  source_hash: "source-hash",
                  candidate_hash: "candidate-hash",
                  source_revision: 2,
                  candidate_title: "Candidate",
                  candidate_summary: "Summary",
                  attempt_count: 1,
                  manual_retry_count: 0,
                }
              : options.state
          ) as T | null;
        },
        async run() {
          writes.push({ sql, args });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: { sql: string; boundArgs: unknown[] }[]) {
      return statements.map((statement, index) => {
        writes.push({ sql: statement.sql, args: statement.boundArgs });
        return {
          success: true,
          meta: { changes: options.changes?.[index] ?? 1 },
        };
      });
    },
  };
  return { db: db as unknown as D1Database, writes };
}

const env = (db: D1Database): Env => ({
  DB: db,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.test/v1",
  ANYROUTER_MODEL: "test-model",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
});

describe("translation review human queue", () => {
  it("returns bounded operator context for terminal unresolved reviews", async () => {
    const { db } = makeDb();
    const rows = await listTranslationReviewQueue(env(db));
    expect(rows[0]?.attempt_id).toBe("attempt-1");
    expect(rows[0]?.can_retry).toBe(true);
    expect(rows[0]?.reason).toBe("needs review");
  });

  it("records actor, action, and note with a compare-and-set resolution", async () => {
    const { db, writes } = makeDb();
    const result = await resolveTranslationReview(env(db), {
      attemptId: "attempt-1",
      action: "accept_original",
      actor: "admin-token",
      note: "Verified against the source article.",
    });
    expect(result).toEqual({
      ok: true,
      stateId: "state-1",
      action: "accept_original",
    });
    const insert = writes.find((write) =>
      write.sql.includes("INSERT INTO translation_review_resolutions")
    );
    expect(insert?.args).toContain("attempt-1");
    expect(insert?.args).toContain("admin-token");
    expect(insert?.args).toContain("Verified against the source article.");
    expect(
      writes.some(
        (write) =>
          write.sql.includes("WHERE state_id = ?") &&
          write.sql.includes("attempt_id = ?")
      )
    ).toBe(true);
    expect(
      writes.some((write) =>
        write.sql.includes("manual_retry_count = manual_retry_count + ?")
      )
    ).toBe(true);
    expect(
      writes.some(
        (write) =>
          write.sql.includes("qa_candidate_hash = ?") &&
          write.sql.includes("qa_reviewer_model = ?")
      )
    ).toBe(true);
  });

  it("rejects a stale or unknown queue item without an audit write", async () => {
    const { db, writes } = makeDb({ state: null });
    const result = await resolveTranslationReview(env(db), {
      attemptId: "missing",
      action: "retry",
      actor: "admin-token",
      note: "retry after checking source",
    });
    expect(result).toEqual({
      ok: false,
      error: "review is not an open human-review item",
      status: 404,
    });
    expect(writes).toHaveLength(0);
  });

  it("exposes a synthetic resolution id when a crashed run has no attempt row", async () => {
    const { db, writes } = makeDb({
      state: { state_id: "state-crashed", attempt_id: null, terminal: 1 },
    });
    const result = await resolveTranslationReview(env(db), {
      attemptId: "state:state-crashed",
      action: "retry",
      actor: "admin-token",
      note: "Retry after the crashed reviewer lease.",
    });
    expect(result.ok).toBe(true);
    expect(
      writes.some((write) => write.args.includes("state:state-crashed"))
    ).toBe(true);
  });

  it("returns conflict when the state changes during resolution", async () => {
    const { db } = makeDb({ changes: [1, 0] });
    const result = await resolveTranslationReview(env(db), {
      attemptId: "attempt-1",
      action: "retry",
      actor: "admin-token",
      note: "retry after a concurrent source update",
    });
    expect(result).toEqual({
      ok: false,
      error: "review changed while resolving; reload the queue",
      status: 409,
    });
  });
});
