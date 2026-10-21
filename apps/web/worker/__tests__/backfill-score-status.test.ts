import type { WorkflowStep } from "cloudflare:workers";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

const scores = new Map<string, number>();

vi.mock("../llm.js", async (original) => ({
  ...(await original<typeof import("../llm.js")>()),
  scoreItems: vi.fn(async (_env: unknown, items: { i: number; id: string }[]) =>
    items.map(({ i, id }) => ({
      i,
      relevance: scores.get(id) ?? 0.9,
      importance: 6,
      quality: 6,
      category: "Models",
      tags: [],
      tokens: 1,
    }))
  ),
}));
vi.mock("../topics.js", async (original) => ({
  ...(await original<typeof import("../topics.js")>()),
  normalizeTopics: vi.fn(async () => new Map()),
}));
vi.mock("../workflow-step.js", () => ({
  llmStep: vi.fn(
    async (
      _step: unknown,
      _env: unknown,
      _runId: unknown,
      _name: string,
      _fallback: unknown,
      fn: () => Promise<unknown>
    ) => fn()
  ),
}));

const { backfillScores } = await import("../ingest/backfill-score.js");

/** SELECTs return the unscored rows; UPDATEs execute against real SQLite so
 *  the status CASE is what SQLite actually does with the binds. */
function harness(statuses: Record<string, string>) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE items (
    id TEXT PRIMARY KEY, status TEXT, llm_relevance REAL, llm_importance REAL,
    llm_quality REAL, category TEXT, tags TEXT, rank_score REAL)`);
  for (const [id, status] of Object.entries(statuses)) {
    sqlite
      .prepare("INSERT INTO items (id, status) VALUES (?, ?)")
      .run(id, status);
  }
  const rows = Object.keys(statuses).map((id) => ({
    id,
    title: id,
    summary: null,
    published_at: Math.floor(Date.now() / 1000),
    fetched_at: Math.floor(Date.now() / 1000),
    tags: null,
    source_id: "hn",
    points: 0,
    comments: 0,
    merged_members: "[]",
  }));
  const db = {
    prepare(sql: string) {
      return {
        all: async () => ({ results: rows }),
        bind: (...args: unknown[]) => ({
          all: async () => ({ results: [] }),
          run: async () => {
            sqlite.prepare(sql).run(...(args as never[]));
            return { success: true };
          },
        }),
      };
    },
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      for (const statement of statements) await statement.run();
    },
  };
  const ctx = {
    step: {} as WorkflowStep,
    env: { DB: db },
    runId: "r",
    steps: [],
  };
  const status = (id: string) =>
    (
      sqlite.prepare("SELECT status FROM items WHERE id = ?").get(id) as {
        status: string;
      }
    ).status;
  return { ctx, status };
}

describe("backfillScores hide rule", () => {
  it("rejects a published row scored under the relevance threshold", async () => {
    scores.set("low", 0.1);
    scores.set("ok", 0.8);
    const { ctx, status } = harness({ low: "published", ok: "published" });
    const out = await backfillScores(ctx as any);
    expect(out.scoredCount).toBe(2);
    expect(status("low")).toBe("rejected");
    expect(status("ok")).toBe("published");
  });

  it("never rewrites a merged row's status", async () => {
    scores.set("dup", 0.1);
    const { ctx, status } = harness({ dup: "merged" });
    await backfillScores(ctx as any);
    expect(status("dup")).toBe("merged");
  });
});
