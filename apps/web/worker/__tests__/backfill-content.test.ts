import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMissingMediaQuery } from "../backfill.js";
import { backfillContent } from "../ingest/backfill.js";
import type { IngestContext } from "../ingest/context.js";
import { parseMediaManifest } from "../media.js";

/** Minimal D1 over node:sqlite; same shape as call-caps.test.ts. */
function sqliteD1(sqlite: DatabaseSync) {
  type Input = null | number | bigint | string | NodeJS.ArrayBufferView;
  return {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let args: Input[] = [];
      const prepared = {
        bind: (...next: unknown[]) => {
          args = next as Input[];
          return prepared;
        },
        all: async () => ({ results: statement.all(...args) as unknown[] }),
        first: async () => statement.get(...args) ?? null,
        run: async () => ({
          success: true,
          meta: { changes: Number(statement.run(...args).changes) },
        }),
      };
      return prepared;
    },
  } as unknown as D1Database;
}

function context(sqlite: DatabaseSync): IngestContext {
  return {
    step: { do: async (_name: string, fn: () => unknown) => fn() },
    env: { DB: sqliteD1(sqlite) },
    runId: "run",
    steps: [],
    mode: {},
  } as unknown as IngestContext;
}

function queuedIds(sqlite: DatabaseSync): string[] {
  return (
    sqlite.prepare(buildMissingMediaQuery(1000)).all() as Array<{ id: string }>
  ).map((row) => row.id);
}

describe("backfillContent media queue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // openai.com answers 403 and reuters.com 401 to the bot. Before #805 such a
  // row stayed '[]', so the newest 15 of them were fetched again every run
  // and the rows behind them were never reached.
  it("fetches a bot-blocked row once, then leaves it out of the queue", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY, url TEXT, source_id TEXT, status TEXT,
          summary TEXT, image_url TEXT,
          media_manifest TEXT NOT NULL DEFAULT '[]', published_at INTEGER
        );
        INSERT INTO items VALUES
          ('blocked', 'https://blocked.example/story', 'openai', 'published',
           'A finished summary.', NULL, '[]', 20),
          ('legacy', 'https://legacy.example/story', 'hn', 'published',
           'A finished summary.', 'https://cdn.example/legacy.jpg', '[]', 10);
      `);
      const fetchMock = vi.fn(
        async () => new Response("Forbidden", { status: 403 })
      );
      vi.stubGlobal("fetch", fetchMock);

      await backfillContent(context(sqlite));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(queuedIds(sqlite)).toEqual([]);

      const legacy = sqlite
        .prepare("SELECT media_manifest, image_url FROM items WHERE id = ?")
        .get("legacy") as { media_manifest: string; image_url: string };
      expect(parseMediaManifest(legacy.media_manifest).assets).toEqual([
        { type: "image", url: "https://cdn.example/legacy.jpg" },
      ]);
      expect(legacy.image_url).toBe("https://cdn.example/legacy.jpg");

      await backfillContent(context(sqlite));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      sqlite.close();
    }
  });

  it("never overwrites a manifest another writer stored during the fetch", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY, url TEXT, source_id TEXT, status TEXT,
          summary TEXT, image_url TEXT,
          media_manifest TEXT NOT NULL DEFAULT '[]', published_at INTEGER
        );
        INSERT INTO items VALUES
          ('raced', 'https://blocked.example/story', 'openai', 'published',
           'A finished summary.', NULL, '[]', 20);
      `);
      const written = JSON.stringify({
        version: 1,
        assets: [{ type: "image", url: "https://cdn.example/merged.jpg" }],
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          sqlite
            .prepare("UPDATE items SET media_manifest = ? WHERE id = 'raced'")
            .run(written);
          return new Response("Forbidden", { status: 403 });
        })
      );

      await backfillContent(context(sqlite));

      expect(
        sqlite
          .prepare("SELECT media_manifest FROM items WHERE id = 'raced'")
          .get()
      ).toEqual({ media_manifest: written });
    } finally {
      sqlite.close();
    }
  });
});
