import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { MergePlan } from "../dedupe.js";
import type { IngestContext } from "../ingest/context.js";
import { writeItems } from "../ingest/write.js";
import { rankScore, rankSignals } from "../ranking.js";
import type { Env } from "../types.js";

/** Minimal D1 over node:sqlite: statements run lazily, `batch` in order. */
function d1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      let args: never[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          args = values as never[];
          return stmt;
        },
        async first<T>() {
          return (db.prepare(sql).get(...args) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...args) as T[] };
        },
        run() {
          db.prepare(sql).run(...args);
        },
      };
      return stmt;
    },
    async batch(stmts: { run(): void }[]) {
      for (const s of stmts) s.run();
      return [];
    },
  };
}

describe("writeItems: merge into an existing canonical", () => {
  // A mirror merged into an older story brings its engagement and sources.
  // The canonical must rank on those merged values this run; the 72h re-rank
  // reads D1 before the batch lands, so letting it write the canonical would
  // put the stale pre-merge score back.
  it("re-ranks the canonical from its whole cluster and keeps that score", async () => {
    const now = Date.UTC(2026, 9, 1, 12);
    const nowSec = now / 1000;
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, status TEXT,
        published_at INTEGER, points INTEGER, comments INTEGER,
        llm_importance REAL, llm_quality REAL, rank_score REAL,
        tags TEXT, url TEXT, image_url TEXT, media_manifest TEXT,
        source_id TEXT, duplicate_of TEXT);
      CREATE TABLE item_sources (item_id TEXT, position INTEGER, kind TEXT,
        author TEXT, posted_at INTEGER, quote TEXT, url TEXT);
      CREATE TABLE item_votes (item_id TEXT NOT NULL, user_id TEXT NOT NULL,
        value INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        PRIMARY KEY (item_id, user_id));`);
    const add = db.prepare(
      `INSERT INTO items VALUES (?, ?, ?, ?, 0, 8, 8, ?, '[]',
         'https://example.com/' || ?, NULL, NULL, ?, ?)`
    );
    // Stored score frozen from when it had 2 points and one source.
    add.run(
      "canon",
      "published",
      nowSec - 30 * 3600,
      2,
      6.7,
      "canon",
      "hn",
      null
    );
    add.run(
      "other",
      "published",
      nowSec - 10 * 3600,
      0,
      1,
      "other",
      "hn",
      null
    );
    // Merged into it on an earlier run.
    add.run(
      "verge",
      "merged",
      nowSec - 29 * 3600,
      0,
      0,
      "verge",
      "theverge-ai",
      "canon"
    );
    db.prepare(
      "INSERT INTO item_sources VALUES ('canon', 0, 'source', NULL, NULL, NULL, 'https://a.test')"
    ).run();

    const extraSources = ["b", "c", "d"].map((h) => ({
      kind: "support" as const,
      url: `https://${h}.test/story`,
    }));
    const mergePlan: MergePlan = {
      merged: new Map(),
      demoted: new Map(),
      canonicalUpdates: new Map([
        [
          "canon",
          {
            isExisting: true,
            extraSources,
            extraTopics: [],
            maxPoints: 135,
            maxComments: 20,
            // This run's merges: author counts from the aggregator must not
            // count as engagement; each outlet counts once.
            members: [
              { sourceId: "huggingnews", points: 400, comments: 900 },
              { sourceId: "marketbrief", points: 380, comments: 850 },
              { sourceId: "techcrunch-ai", points: 0, comments: 0 },
              { sourceId: "hn", points: 135, comments: 20 },
            ],
          },
        ],
      ]),
    };
    const ctx = {
      env: { DB: d1(db) } as unknown as Env,
      step: { do: (_name: string, fn: () => Promise<unknown>) => fn() },
    } as unknown as IngestContext;

    await writeItems(ctx, {
      newRows: [],
      scored: new Map(),
      translated: new Map(),
      mergePlan,
      canonicalTagsByItem: new Map(),
      now,
    });

    const row = (id: string) =>
      db.prepare("SELECT rank_score FROM items WHERE id = ?").get(id) as {
        rank_score: number;
      };
    const sources = db
      .prepare("SELECT COUNT(*) AS n FROM item_sources WHERE item_id = 'canon'")
      .get() as { n: number };
    const expected = rankScore({
      importance: 8,
      quality: 8,
      points: 135,
      comments: 20,
      publishedAt: (nowSec - 30 * 3600) * 1000,
      now,
      // hn, theverge-ai, aggregator, techcrunch-ai
      sourceCount: 4,
    });
    expect(
      rankSignals([
        { sourceId: "hn", points: 135, comments: 20 },
        { sourceId: "theverge-ai", points: 0, comments: 0 },
        { sourceId: "huggingnews", points: 400, comments: 900 },
        { sourceId: "techcrunch-ai", points: 0, comments: 0 },
      ])
    ).toEqual({ points: 135, comments: 20, sourceCount: 4 });
    // item_sources rows stay for display; they are not the corroboration count.
    expect(sources.n).toBe(1 + extraSources.length);
    expect(row("canon").rank_score).toBeCloseTo(expected, 6);
    expect(row("canon").rank_score).toBeGreaterThan(6.7);
    // The window re-rank still ran for the untouched item.
    expect(row("other").rank_score).not.toBe(1);
  });

  it("logs a summary change before the item upsert and leaves title unlogged", async () => {
    const prepared: { sql: string; args: unknown[] }[] = [];
    const ctx = {
      env: {
        DB: {
          prepare(sql: string) {
            const statement = {
              bind(...args: unknown[]) {
                prepared.push({ sql, args });
                return statement;
              },
              async first() {
                return null;
              },
              async all() {
                return { results: [] as unknown[] };
              },
              run() {},
            };
            return statement;
          },
          async batch(stmts: { run(): void }[]) {
            for (const s of stmts) s.run();
            return [];
          },
        },
      } as unknown as Env,
      step: { do: (_name: string, fn: () => Promise<unknown>) => fn() },
    } as unknown as IngestContext;

    await writeItems(ctx, {
      newRows: [
        {
          id: "item-vi",
          source: { id: "vn", type: "rss", config: "{}", enabled: 1 },
          item: {
            url: "https://example.com/vi",
            title: "Tiêu đề",
            summary: "Tóm tắt nguồn",
            publishedAt: 1_700_000_000,
            sourceLang: "vi",
          },
        },
      ],
      scored: new Map(),
      translated: new Map(),
      mergePlan: {
        merged: new Map(),
        demoted: new Map(),
        canonicalUpdates: new Map(),
      },
      canonicalTagsByItem: new Map(),
      now: Date.UTC(2026, 9, 1, 12),
    });

    const itemFieldLogs = prepared.filter(
      (row) =>
        row.sql.includes("item_content_log") && row.sql.includes("FROM items")
    );
    expect(itemFieldLogs).toHaveLength(1);
    expect(itemFieldLogs[0]?.sql).toContain("'summary'");
    expect(itemFieldLogs[0]?.sql).toContain("SELECT id, 'vi', 'summary'");
    expect(itemFieldLogs[0]?.sql).not.toContain("'title'");
    expect(itemFieldLogs[0]?.args[1]).toBe("ingest");
    expect(itemFieldLogs[0]?.args.at(-1)).toBe("Tóm tắt nguồn");
    const logAt = prepared.indexOf(itemFieldLogs[0]!);
    const upsertAt = prepared.findIndex((row) =>
      row.sql.startsWith("INSERT INTO items")
    );
    expect(logAt).toBeGreaterThanOrEqual(0);
    expect(logAt).toBeLessThan(upsertAt);
  });
});
