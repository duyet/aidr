/**
 * #144 — the JEV panel on the submission and translation-suggestion paths.
 *
 * The gate itself is mocked so these tests pin the call-site contract: with
 * the panel off (gate returns null) behavior is unchanged, and when the panel
 * lowers the value an accept becomes a reject. It can never turn a reject
 * into an accept, because it is only consulted on would-be accepts and only
 * ever lowers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JevScoreReviewOutcome } from "../jev-panel/score-review.js";

const gate = vi.hoisted(() => vi.fn());
vi.mock("../jev-panel/score-review.js", async (original) => ({
  ...(await original<typeof import("../jev-panel/score-review.js")>()),
  runJevPanelGate: gate,
}));

const { reviewPendingSubmissions } = await import("../submissions.js");
const { reviewPendingSuggestions } = await import("../suggestions.js");

import type { Env } from "../types.js";

const env: Env = {
  DB: {} as D1Database,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
  ANYROUTER_MODEL: "test-model",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
};

function chatResponse(content: string): Response {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200 }
  );
}

/** Non-gateway URLs get HTML (og fetch); Jev SystemOne is unavailable, so the
 *  chat fallback answers with `answer`, and any later call re-translates. */
function stubFetch(answer: string) {
  let chats = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: string }) => {
      const href = String(url);
      if (!href.startsWith("https://anyrouter.test")) {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if ((init?.body ?? "").includes("jev")) {
        return new Response("typesafe key missing", { status: 422 });
      }
      chats++;
      return chatResponse(
        chats === 1 ? answer : JSON.stringify({ translation: "Tiêu đề mới" })
      );
    })
  );
}

function recordingDb(rows: {
  all: (sql: string) => unknown[];
  first?: (sql: string) => unknown;
}) {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const bound = () => ({
        all: async () => ({ results: rows.all(sql) }),
        first: async () => rows.first?.(sql) ?? null,
        run: async () => ({ success: true, meta: { changes: 1 } }),
      });
      return {
        ...bound(),
        bind: (...args: unknown[]) => {
          calls.push({ sql, args });
          return bound();
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

function lowered(before: number, after: number): JevScoreReviewOutcome {
  return {
    kind: "opposed",
    reason: "panel voted against publication; relevance forced to 0",
    recommendation: "oppose",
    quorumReached: true,
    idempotencyKey: "k",
    relevanceBefore: before,
    relevanceAfter: after,
    category: null,
    categoryApplied: false,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  gate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submissions path", () => {
  const submission = {
    id: "sub1",
    url: "https://example.com/real-ai-news",
    title: "New model beats benchmark",
    note: null,
  };
  const rows = {
    all: (sql: string) =>
      sql.includes("FROM submissions") ? [submission] : [],
  };

  it("keeps the accept when the panel is off", async () => {
    gate.mockResolvedValue(null);
    stubFetch(JSON.stringify({ relevance: 0.9, note: "genuine" }));
    const { db, calls } = recordingDb(rows);

    await reviewPendingSubmissions({ ...env, DB: db });

    expect(gate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        purpose: "score",
        subjectId: "sub1",
        primary: 0.9,
      })
    );
    expect(calls.some((c) => c.sql.includes("status = 'accepted'"))).toBe(true);
  });

  it("rejects when the panel lowers relevance below the accept bar", async () => {
    gate.mockResolvedValue(lowered(0.9, 0));
    stubFetch(JSON.stringify({ relevance: 0.9, note: "genuine" }));
    const { db, calls } = recordingDb(rows);

    await reviewPendingSubmissions({ ...env, DB: db });

    expect(calls.some((c) => c.sql.includes("INSERT INTO items"))).toBe(false);
    const rejected = calls.find((c) => c.sql.includes("status = 'rejected'"));
    expect(rejected?.args[0]).toBe(0);
    expect(String(rejected?.args[1])).toMatch(/panel:/);
  });

  it("cannot rescue a rejected submission", async () => {
    // A (buggy) outcome claiming a higher value is still clamped by
    // jevPanelRelevance to the primary value.
    gate.mockResolvedValue(lowered(0.1, 1));
    stubFetch(JSON.stringify({ relevance: 0.1, note: "spam" }));
    const { db, calls } = recordingDb(rows);

    await reviewPendingSubmissions({ ...env, DB: db });

    expect(calls.some((c) => c.sql.includes("status = 'accepted'"))).toBe(
      false
    );
  });
});

describe("translation-suggestion path", () => {
  const rows = {
    all: (sql: string) =>
      sql.includes("translation_suggestions")
        ? [{ id: "s1", item_id: "item1", field: "title", suggestion: "Hay" }]
        : [],
    first: (sql: string) => {
      if (sql.includes("FROM items"))
        return { title: "Original Title", summary: "Original summary" };
      if (sql.includes("FROM translations"))
        return { title: "Tiêu đề cũ", summary: "Tóm tắt cũ" };
      return null;
    },
  };
  const accept = JSON.stringify({
    results: [{ id: "s1", valid: true, rating: 0.9, note: "improvement" }],
  });

  it("asks the translation panel with source, current, and suggestion", async () => {
    gate.mockResolvedValue(null);
    stubFetch(accept);
    const { db, calls } = recordingDb(rows);

    await reviewPendingSuggestions({ ...env, DB: db });

    expect(gate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        purpose: "translation",
        subjectId: "s1",
        primary: 0.9,
        content: expect.objectContaining({
          sourceText: "Original Title",
          currentTranslation: "Tiêu đề cũ",
          suggestion: "Hay",
        }),
      })
    );
    expect(calls.some((c) => c.sql.includes("status = 'accepted'"))).toBe(true);
  });

  it("rejects the suggestion when the panel lowers its rating", async () => {
    gate.mockResolvedValue(lowered(0.9, 0.2));
    stubFetch(accept);
    const { db, calls } = recordingDb(rows);

    await reviewPendingSuggestions({ ...env, DB: db });

    expect(calls.some((c) => c.sql.includes("INSERT INTO translations"))).toBe(
      false
    );
    const rejected = calls.find(
      (c) =>
        c.sql.includes("UPDATE translation_suggestions") &&
        c.sql.includes("status = 'rejected'")
    );
    expect(rejected?.args[0]).toBe(0.2);
  });

  it("does not consult the panel for a suggestion already rejected", async () => {
    stubFetch(
      JSON.stringify({
        results: [{ id: "s1", valid: false, rating: 0.1, note: "spam" }],
      })
    );
    const { db } = recordingDb(rows);

    await reviewPendingSuggestions({ ...env, DB: db });

    expect(gate).not.toHaveBeenCalled();
  });
});
