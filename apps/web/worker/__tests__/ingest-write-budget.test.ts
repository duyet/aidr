import { describe, expect, it } from "vitest";
import type { MergePlan } from "../dedupe.js";
import type { IngestContext, NewRow } from "../ingest/context.js";
import { dedupeNewRows, MAX_NEW_ROWS_PER_RUN } from "../ingest/dedupe.js";
import { WRITE_D1_MAX_STATEMENTS, writeItems } from "../ingest/write.js";
import type { Env } from "../types.js";

const source = { id: "rss", type: "rss", config: "{}", enabled: 1 };
const nowMs = Date.UTC(2026, 9, 21, 12);

function fakeDb(pendingNew: unknown[] = []) {
  const batches: number[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        first: async () => null,
        all: async () => ({
          results: sql.includes("status = 'new'") ? pendingNew : [],
        }),
        run: async () => ({ success: true }),
      };
      return stmt;
    },
    async batch(stmts: unknown[]) {
      batches.push(stmts.length);
      return [];
    },
  };
  return { db, batches };
}

function ctxFor(db: unknown): IngestContext {
  return {
    step: { do: (_name: string, fn: () => unknown) => fn() },
    env: { DB: db } as unknown as Env,
    runId: "run",
    steps: [],
    mode: { kind: "full" },
  } as unknown as IngestContext;
}

function fetchedItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://example.com/backlog/${i}`,
    title: `Backlog story ${i}`,
    publishedAt: nowMs / 1000 - i * 60,
    points: 0,
    comments: 0,
  }));
}

describe("ingest write budget", () => {
  it("defers a backlog past one run's D1 statement budget to later runs", async () => {
    const { db } = fakeDb();
    const rows = await dedupeNewRows(
      ctxFor(db),
      [{ source, items: fetchedItems(300) }],
      [source],
      300
    );
    expect(rows.length).toBe(MAX_NEW_ROWS_PER_RUN);
  });

  it("keeps pending user submissions when the fetched backlog is capped", async () => {
    const pending = {
      id: "submitted",
      source_id: "rss",
      external_id: null,
      url: "https://example.com/submitted",
      title: "Submitted",
      summary: null,
      published_at: nowMs / 1000,
      points: 0,
      comments: 0,
      image_url: null,
      source_lang: "en",
      media_manifest: null,
    };
    const { db } = fakeDb([pending]);
    const rows = await dedupeNewRows(
      ctxFor(db),
      [{ source, items: fetchedItems(300) }],
      [source],
      300
    );
    expect(rows.length).toBe(MAX_NEW_ROWS_PER_RUN);
    expect(rows.map((row) => row.id)).toContain("submitted");
  });

  it("does not let one flooded source starve the others", async () => {
    const { db } = fakeDb();
    const quiet = { ...source, id: "quiet" };
    const rows = await dedupeNewRows(
      ctxFor(db),
      [
        { source, items: fetchedItems(300) },
        {
          source: quiet,
          items: [
            {
              url: "https://quiet.example.com/launch",
              title: "Quiet launch",
              publishedAt: nowMs / 1000 - 3600,
              points: 0,
              comments: 0,
            },
          ],
        },
      ],
      [source, quiet],
      301
    );
    expect(rows.length).toBe(MAX_NEW_ROWS_PER_RUN);
    expect(rows.map((row) => row.source.id)).toContain("quiet");
  });

  it("writes a full run of worst-case rows in one batch under the budget", async () => {
    const { db, batches } = fakeDb();
    const sources = Array.from({ length: 12 }, (_, i) => ({
      kind: "post",
      url: `https://example.com/s/${i}`,
    }));
    const newRows = Array.from({ length: MAX_NEW_ROWS_PER_RUN }, (_, i) => ({
      id: `row-${i}`,
      source,
      item: { ...fetchedItems(1)[0], url: `https://e.com/${i}`, sources },
    })) as unknown as NewRow[];
    const scored = new Map(
      newRows.map((row) => [
        row.id,
        { relevance: 0.9, importance: 8, quality: 8, tags: [] },
      ])
    );
    const translated = new Map(
      newRows.map((row) => [row.id, { title: "t", summary: "s" }])
    );
    const mergePlan = {
      merged: new Map(),
      demoted: new Map(),
      canonicalUpdates: new Map(),
    } as unknown as MergePlan;
    await writeItems(ctxFor(db), {
      newRows,
      scored: scored as never,
      translated: translated as never,
      mergePlan,
      canonicalTagsByItem: new Map(),
      now: nowMs,
    });
    expect(batches.length).toBe(1);
    expect(batches[0]).toBeLessThanOrEqual(WRITE_D1_MAX_STATEMENTS);
  });
});
