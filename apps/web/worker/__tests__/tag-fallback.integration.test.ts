/**
 * #770: Jev answers `none` for both the entity and the theme of about 9% of
 * stories, and those published with `tags = '[]'`. This runs the real score,
 * normalize-topics and write steps on SQLite with every migration, with Jev
 * stubbed at `fetch`. Any other model call fails the test.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestContext, NewRow } from "../ingest/context.js";
import { EMPTY_MERGE_PLAN } from "../ingest/merge.js";
import { scoreNewRows } from "../ingest/score.js";
import { normalizeNewRowTopics } from "../ingest/topics.js";
import { writeItems } from "../ingest/write.js";
import type { Env } from "../types.js";

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as SqliteInput[];
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  async batch(statements: Array<{ all: () => Promise<unknown> }>) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const statement of statements) out.push(await statement.all());
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const name of readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
  }
  return db;
}

/** Production canonicals the fallback may name. */
function seedTopics(db: DatabaseSync, names: string[]) {
  const insert = db.prepare(
    "INSERT INTO topics (name, canonical, count, last_seen) VALUES (?, ?, 1, 1)"
  );
  for (const name of names) insert.run(name, name);
}

const NOW = new Date("2026-10-14T03:00:00Z");
const NOW_SEC = Math.floor(NOW.getTime() / 1000);
const id = (n: number) => n.toString(16).padStart(64, "0");

const SAMSUNG = id(0x770);
const PROMO = id(0x771);
const OPENAI = id(0x772);

function newRow(rowId: string, sourceId: string, title: string): NewRow {
  return {
    id: rowId,
    source: { id: sourceId, type: "rss", config: "{}", enabled: 1 },
    item: {
      url: `https://example.test/${rowId.slice(-4)}`,
      title,
      publishedAt: NOW_SEC - 600,
    },
  };
}

// Production 4e724b01 (Jev none/none), a TechCrunch Disrupt promo (nothing
// the fallback should name), and a story Jev did tag.
const ROWS = [
  newRow(
    SAMSUNG,
    "vnexpress-tech",
    "Tính năng hút người dùng của dòng smartphone gập Samsung"
  ),
  newRow(
    PROMO,
    "techcrunch-ai",
    "Last 24 hours: Exhibit at TechCrunch Disrupt 2026 and reach 10,000+ tech leaders"
  ),
  newRow(OPENAI, "hn", "OpenAI ships a Samsung phone app"),
];

/** Jev's typed answers: none/none except for the OpenAI story. */
function jevAnswers(title: string) {
  const tagged = title.startsWith("OpenAI");
  return {
    is_ai_tech: { type: "noul", noul: 0.9 },
    importance: { type: "score", score: "6" },
    quality: { type: "score", score: "7" },
    category: { type: "choice", choice: "Products" },
    builder: { type: "choice", choice: "none" },
    entity: { type: "choice", choice: tagged ? "openai" : "none" },
    theme: { type: "choice", choice: tagged ? "llm" : "none" },
  };
}

const env = (db: DatabaseSync): Env =>
  ({
    DB: new SqliteD1(db) as unknown as D1Database,
    ANYROUTER_BASE_URL: "https://anyrouter.dev/api/v1",
    ANYROUTER_MODEL: "test-model",
    ANYROUTER_API_KEY: "test-key",
  }) as Env;

function context(db: DatabaseSync): IngestContext {
  return {
    env: env(db),
    runId: "test-run",
    steps: [],
    step: {
      do: (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)(),
    },
  } as unknown as IngestContext;
}

let db: DatabaseSync;
let modelCalls: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db = migratedDb();
  seedTopics(db, ["samsung", "smartphone", "openai", "llm"]);
  modelCalls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    modelCalls.push(`${new URL(url).pathname} ${body.model}`);
    if (!String(url).endsWith("/systemone")) {
      return new Response("no other model call in this test", { status: 500 });
    }
    return Response.json({
      model: "typesafe/jev",
      answers: jevAnswers(String(body.state?.title ?? "")),
      usage: { input_tokens: 10, output_tokens: 0, cost: 0 },
    });
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const tagsOf = (rowId: string): string[] =>
  JSON.parse(
    (db.prepare("SELECT tags FROM items WHERE id = ?").get(rowId) as {
      tags: string;
    }).tags
  );

describe("ingest tags a story Jev answers none/none for (#770)", () => {
  it("stores the fallback tags, adds no model call, and leaves Jev's tags alone", async () => {
    const ctx = context(db);
    const scored = await scoreNewRows(ctx, ROWS);
    expect(scored.get(SAMSUNG)?.tags).toEqual([]);

    const canonicalTagsByItem = await normalizeNewRowTopics(
      ctx,
      ROWS,
      scored,
      NOW.getTime()
    );
    await writeItems(ctx, {
      newRows: ROWS,
      scored,
      translated: new Map(),
      mergePlan: EMPTY_MERGE_PLAN,
      canonicalTagsByItem,
      now: NOW.getTime(),
    });

    expect(tagsOf(SAMSUNG)).toEqual(["samsung", "smartphone"]);
    expect(tagsOf(PROMO)).toEqual([]);
    expect(tagsOf(OPENAI)).toEqual(["openai", "llm"]);
    expect(modelCalls.every((call) => call.startsWith("/api/v1/systemone"))).toBe(
      true
    );
  });
});
