import { readFileSync } from "node:fs";
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

const SUMMARY_CHECKED_MIGRATION = readFileSync(
  new URL("../../migrations/0066_item_summary_checked.sql", import.meta.url),
  "utf8"
);

/** items as production has it after 0066, plus the QA columns that
 * prepareTranslationQaInvalidation clears. */
function summarySchema(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY, url TEXT, source_id TEXT, status TEXT,
      summary TEXT, image_url TEXT,
      media_manifest TEXT NOT NULL DEFAULT '[]', published_at INTEGER
    );
    CREATE TABLE translations (
      item_id TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'vi',
      title TEXT, summary TEXT,
      qa_rating INTEGER, qa_at INTEGER, qa_source_hash TEXT,
      qa_candidate_hash TEXT, qa_source_revision INTEGER, qa_direction TEXT,
      qa_reviewer_model TEXT, qa_criteria_version TEXT,
      PRIMARY KEY (item_id, lang)
    );
  `);
  sqlite.exec(SUMMARY_CHECKED_MIGRATION);
}

function html(meta: Record<string, string>): Response {
  const tags = Object.entries(meta)
    .map(
      ([property, content]) =>
        `<meta property="${property}" content="${content}">`
    )
    .join("");
  return new Response(`<html><head>${tags}</head><body></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function stepAction(ctx: IngestContext): string | undefined {
  return ctx.steps.find((step) => step.name === "backfill-content")?.action;
}

describe("backfillContent summary queue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // reuters.com answers 401 and ft.com 403 to the bot. On 2026-10-16 four such
  // rows sat in the newest-15 summary head and were fetched on every run.
  it("fetches a bot-blocked row once, then leaves it out of the queue", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      summarySchema(sqlite);
      sqlite.exec(`
        INSERT INTO items (id, url, source_id, status, summary, media_manifest, published_at)
        VALUES ('blocked', 'https://blocked.example/story', 'hn', 'published',
                NULL, '{"version":1,"assets":[]}', 20);
      `);
      const fetchMock = vi.fn(
        async () => new Response("Unauthorized", { status: 401 })
      );
      vi.stubGlobal("fetch", fetchMock);

      await backfillContent(context(sqlite));
      await backfillContent(context(sqlite));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        sqlite.prepare("SELECT summary FROM items WHERE id = 'blocked'").get()
      ).toEqual({ summary: null });
    } finally {
      sqlite.close();
    }
  });

  // Production shape on 2026-10-15: a techmeme permalink gives an og:image
  // that is already stored and no description. The plan equalled the row, yet
  // every run rewrote it, reported "backfilled 11 summaries" and wiped the
  // VI translation's QA verdict.
  it("does not rewrite an unchanged cut-off summary or clear its translation QA", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      summarySchema(sqlite);
      const image = "https://cdn.example/story.jpg";
      const manifest = JSON.stringify({
        version: 1,
        assets: [{ type: "image", url: image }],
      });
      const teaser =
        "Asian chipmakers tracked Wall Street losses as concerns …";
      sqlite
        .prepare(
          `INSERT INTO items (id, url, source_id, status, summary, image_url, media_manifest, published_at)
           VALUES ('teaser', 'https://river.example/p1', 'techmeme', 'published', ?, ?, ?, 20)`
        )
        .run(teaser, image, manifest);
      sqlite.exec(`
        INSERT INTO translations (item_id, lang, title, summary, qa_rating, qa_at)
        VALUES ('teaser', 'vi', 'Tiêu đề', 'Tóm tắt', 5, 1792000000);
      `);
      const fetchMock = vi.fn(async () => html({ "og:image": image }));
      vi.stubGlobal("fetch", fetchMock);

      const ctx = context(sqlite);
      await backfillContent(ctx);
      await backfillContent(context(sqlite));

      expect(
        sqlite.prepare("SELECT qa_rating, qa_at FROM translations").get()
      ).toEqual({ qa_rating: 5, qa_at: 1792000000 });
      expect(stepAction(ctx)).toBe("0 candidates backfilled");
      expect(
        sqlite
          .prepare(
            "SELECT summary, image_url, media_manifest FROM items WHERE id = 'teaser'"
          )
          .get()
      ).toEqual({
        summary: teaser,
        image_url: image,
        media_manifest: manifest,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      sqlite.close();
    }
  });

  it("writes a finished summary over a cut-off one and clears the stale QA", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      summarySchema(sqlite);
      sqlite.exec(`
        INSERT INTO items (id, url, source_id, status, summary, media_manifest, published_at)
        VALUES ('teaser', 'https://news.example/ipo', 'techmeme', 'published',
                'An IPO prospectus seen by Reu…', '{"version":1,"assets":[]}', 20);
        INSERT INTO translations (item_id, lang, title, summary, qa_rating, qa_at)
        VALUES ('teaser', 'vi', 'Tiêu đề', 'Tóm tắt', 5, 1792000000);
      `);
      const finished =
        "An IPO prospectus seen by Reuters put the loss at $41.97 billion.";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => html({ "og:description": finished }))
      );

      const ctx = context(sqlite);
      await backfillContent(ctx);

      expect(stepAction(ctx)).toBe("backfilled 1 summaries");
      expect(
        sqlite.prepare("SELECT summary FROM items WHERE id = 'teaser'").get()
      ).toEqual({ summary: finished });
      expect(
        sqlite.prepare("SELECT qa_rating, qa_at FROM translations").get()
      ).toEqual({ qa_rating: null, qa_at: null });
    } finally {
      sqlite.close();
    }
  });

  it("writes a new picture without clearing translation QA", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      summarySchema(sqlite);
      sqlite.exec(`
        INSERT INTO items (id, url, source_id, status, summary, media_manifest, published_at)
        VALUES ('teaser', 'https://river.example/p1', 'techmeme', 'published',
                'Chipmakers tracked losses as concerns …', '{"version":1,"assets":[]}', 20);
        INSERT INTO translations (item_id, lang, title, summary, qa_rating, qa_at)
        VALUES ('teaser', 'vi', 'Tiêu đề', 'Tóm tắt', 5, 1792000000);
      `);
      const image = "https://cdn.example/story.jpg";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => html({ "og:image": image }))
      );

      await backfillContent(context(sqlite));

      expect(
        sqlite.prepare("SELECT image_url FROM items WHERE id = 'teaser'").get()
      ).toEqual({ image_url: image });
      expect(
        sqlite.prepare("SELECT qa_rating, qa_at FROM translations").get()
      ).toEqual({ qa_rating: 5, qa_at: 1792000000 });
    } finally {
      sqlite.close();
    }
  });

  // A summary another writer stored while the page was fetched was never
  // judged by this fetch, so the row stays queued for one of its own.
  it("leaves a row queued when its summary changed during the fetch", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      summarySchema(sqlite);
      sqlite.exec(`
        INSERT INTO items (id, url, source_id, status, summary, media_manifest, published_at)
        VALUES ('raced', 'https://blocked.example/story', 'hn', 'published',
                NULL, '{"version":1,"assets":[]}', 20);
      `);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          sqlite
            .prepare("UPDATE items SET summary = ? WHERE id = 'raced'")
            .run("Another source's teaser …");
          return new Response("Unauthorized", { status: 401 });
        })
      );

      await backfillContent(context(sqlite));

      expect(
        sqlite
          .prepare("SELECT summary_checked_at FROM items WHERE id = 'raced'")
          .get()
      ).toEqual({ summary_checked_at: null });
    } finally {
      sqlite.close();
    }
  });

  // 0066 is applied by hand after deploy. Until then the summary query must
  // not name the column: a "no such column" error here would also end the
  // media leg in the same try.
  it("keeps both legs running before migration 0066 is applied", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY, url TEXT, source_id TEXT, status TEXT,
          summary TEXT, image_url TEXT,
          media_manifest TEXT NOT NULL DEFAULT '[]', published_at INTEGER
        );
        CREATE TABLE translations (item_id TEXT, lang TEXT, qa_rating INTEGER,
          qa_at INTEGER, qa_source_hash TEXT, qa_candidate_hash TEXT,
          qa_source_revision INTEGER, qa_direction TEXT,
          qa_reviewer_model TEXT, qa_criteria_version TEXT);
        INSERT INTO items VALUES
          ('teaser', 'https://news.example/ipo', 'hn', 'published',
           'An IPO prospectus seen by Reu…', NULL, '{"version":1,"assets":[]}', 20),
          ('legacy', 'https://legacy.example/story', 'hn', 'published',
           'A finished summary.', 'https://cdn.example/legacy.jpg', '[]', 10);
      `);
      const finished =
        "An IPO prospectus seen by Reuters put the loss at $41.97 billion.";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => html({ "og:description": finished }))
      );

      await backfillContent(context(sqlite));

      expect(
        sqlite.prepare("SELECT summary FROM items WHERE id = 'teaser'").get()
      ).toEqual({ summary: finished });
      expect(queuedIds(sqlite)).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
