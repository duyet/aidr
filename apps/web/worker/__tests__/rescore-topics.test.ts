import type { WorkflowStep } from "cloudflare:workers";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";

vi.mock("../llm.js", async (original) => ({
  ...(await original<typeof import("../llm.js")>()),
  scoreItems: vi.fn(async (_env: unknown, items: { i: number; id: string }[]) =>
    items.map(({ i, id }) => ({
      i,
      relevance: id === "off-topic" ? 0.1 : 0.9,
      importance: 6,
      quality: 6,
      category: "Models",
      tags: ["raw-tag"],
      tokens: 4,
    }))
  ),
}));
vi.mock("../topics.js", async (original) => ({
  ...(await original<typeof import("../topics.js")>()),
  normalizeTopics: vi.fn(
    async (_env: unknown, stories: ReadonlyMap<string, unknown>) =>
      new Map([...stories.keys()].map((id) => [id, ["anthropic", "claude"]]))
  ),
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

function d1(sqlite: DatabaseSync, unscored: Record<string, unknown>[]) {
  const statement = (sql: string, args: unknown[] = []) => ({
    all: async () => ({
      results: sql.includes("llm_relevance IS NULL")
        ? unscored
        : sqlite.prepare(sql).all(...(args as never[])),
    }),
    bind: (...bound: unknown[]) => statement(sql, bound),
    run: async () => {
      sqlite.prepare(sql).run(...(args as never[]));
      return { success: true };
    },
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: { run: () => Promise<unknown> }[]) => {
      for (const s of statements) await s.run();
    },
  };
}

describe("backfillScores records topics", () => {
  it("counts the rescored stories' canonical tags in topic_daily", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE topic_daily (
      day TEXT NOT NULL, topic TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, topic));
    CREATE TABLE learned_keywords (
      keyword TEXT PRIMARY KEY, source_topic TEXT NOT NULL, first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL, hit_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active')`);
    sqlite.exec(`CREATE TABLE items (
      id TEXT PRIMARY KEY, status TEXT, llm_relevance REAL, llm_importance REAL,
      llm_quality REAL, category TEXT, tags TEXT, rank_score REAL)`);
    const ids = ["a", "b", "off-topic"];
    for (const id of ids) {
      sqlite
        .prepare("INSERT INTO items (id, status) VALUES (?, 'published')")
        .run(id);
    }
    const unscored = ids.map((id) => ({
      id,
      title: id,
      summary: null,
      published_at: Math.floor(Date.now() / 1000),
      source_id: "hn",
      points: 0,
      comments: 0,
      merged_members: "[]",
    }));
    const ctx = {
      step: {} as WorkflowStep,
      env: { DB: d1(sqlite, unscored) },
      runId: "r",
      steps: [],
    };

    const out = await backfillScores(ctx as never);

    expect(out.scoredCount).toBe(3);
    const counts = Object.fromEntries(
      (
        sqlite.prepare("SELECT topic, count FROM topic_daily").all() as {
          topic: string;
          count: number;
        }[]
      ).map((r) => [r.topic, r.count])
    );
    expect(counts).toMatchObject({ anthropic: 3, claude: 3 });
    const tags = sqlite
      .prepare("SELECT tags FROM items WHERE id = 'a'")
      .get() as {
      tags: string;
    };
    expect(JSON.parse(tags.tags)).toEqual(["anthropic", "claude"]);
  });
});
