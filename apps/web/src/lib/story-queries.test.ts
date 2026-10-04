/**
 * Story permalink data edge cases (#139): an id that matches nothing must be
 * a clean "not found", and a row whose source link or image is unusable must
 * still resolve, with the bad field emptied and never passed through.
 */
import { describe, expect, it } from "vitest";
import { getStory } from "./story-queries";

type Row = Record<string, unknown>;

function makeDb(rows: Row[], opts: { sources?: Row[] } = {}) {
  const stmt = (sql: string) => ({
    sql,
    bind() {
      return this;
    },
    async all() {
      return { results: sql.includes("FROM items LIMIT 1") ? [] : rows };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    async batch(stmts: { sql: string }[]) {
      return stmts.map((s) =>
        s.sql.includes("item_sources")
          ? { results: opts.sources ?? [] }
          : { results: rows }
      );
    },
  } as unknown as Parameters<typeof getStory>[0];
}

const base: Row = {
  id: "abcdef12deadbeefabcdef12deadbeefabcdef12deadbeefabcdef12deadbeef",
  url: "https://example.com/post",
  title: "A story",
  published_at: 1_700_000_000,
  image_url: "https://img.example.com/a.jpg",
  media_manifest: null,
};

describe("getStory edge cases", () => {
  it("returns null for an id prefix that matches no published story", async () => {
    expect(await getStory(makeDb([]), "00000000")).toBeNull();
  });

  it("empties a source link that is not a public http(s) URL", async () => {
    for (const url of [
      "javascript:alert(1)",
      "not a url",
      "http://127.0.0.1/admin",
      "",
    ]) {
      const item = await getStory(makeDb([{ ...base, url }]), "abcdef12");
      expect(item?.url, url).toBe("");
    }
  });

  it("drops an unusable image instead of exposing it", async () => {
    for (const image_url of ["data:image/png;base64,AAAA", "nope", null]) {
      const item = await getStory(makeDb([{ ...base, image_url }]), "abcdef12");
      expect(item?.image_url, String(image_url)).toBeNull();
    }
  });

  it("keeps the story when a related source link is broken", async () => {
    const item = await getStory(
      makeDb([base], {
        sources: [
          {
            item_id: base.id,
            kind: "source",
            author: "ann",
            posted_at: null,
            quote: null,
            url: "javascript:void(0)",
          },
        ],
      }),
      "abcdef12"
    );
    expect(item?.sources).toHaveLength(1);
    expect(item?.sources[0].url).toBeNull();
  });

  it("marks a missing timestamp as NaN so pages can omit the date", async () => {
    const item = await getStory(
      makeDb([{ ...base, published_at: null }]),
      "abcdef12"
    );
    expect(item).not.toBeNull();
    expect(Number.isFinite(item?.published_at)).toBe(false);
  });
});

/** An aggregator canonical that an official post replaced (worker
 * `MergePlan.demoted`) is `merged` now, but its permalink is already in
 * Telegram posts and past editions: it must resolve to the new canonical,
 * which the permalink loader then redirects to. */
describe("getStory for a merged id", () => {
  const canonical: Row = { ...base, id: "c0a0a5f5".padEnd(64, "0") };

  function mergedDb(mergedRows: Row[]) {
    const stmt = (sql: string) => {
      let args: unknown[] = [];
      return {
        sql,
        get args() {
          return args;
        },
        bind(...bound: unknown[]) {
          args = bound;
          return this;
        },
        async all() {
          if (sql.includes("status = 'merged'")) return { results: mergedRows };
          if (sql.includes("FROM items LIMIT 1")) return { results: [] };
          return { results: [] };
        },
      };
    };
    return {
      prepare: (sql: string) => stmt(sql),
      async batch(stmts: { sql: string; args: unknown[] }[]) {
        return stmts.map((s) => {
          if (s.sql.includes("item_sources")) return { results: [] };
          // Only the canonical's own prefix finds a published row.
          return {
            results: s.args[1] === canonical.id ? [canonical] : [],
          };
        });
      },
    } as unknown as Parameters<typeof getStory>[0];
  }

  it("resolves to the story it was merged into", async () => {
    const item = await getStory(
      mergedDb([{ duplicate_of: canonical.id }]),
      "932a29ca"
    );
    expect(item?.id).toBe(canonical.id);
  });

  it("stays not-found for an unknown or ambiguous prefix", async () => {
    expect(await getStory(mergedDb([]), "932a29ca")).toBeNull();
    expect(
      await getStory(
        mergedDb([{ duplicate_of: canonical.id }, { duplicate_of: "other" }]),
        "93"
      )
    ).toBeNull();
  });
});

/**
 * Edit history is a getStory read, capped so a permalink stays small. A
 * database that has not applied migration 0047 must still return the story:
 * the field is omitted, and the page renders without a history list.
 */
describe("getStory content log", () => {
  function contentLogDb(log: Row[] | Error) {
    const prepared: string[] = [];
    const stmt = (sql: string) => {
      prepared.push(sql);
      return {
        sql,
        bind() {
          return this;
        },
        async all() {
          if (sql.includes("item_content_log")) {
            if (log instanceof Error) throw log;
            return { results: log };
          }
          if (sql.includes("FROM items LIMIT 1")) return { results: [] };
          return { results: [base] };
        },
      };
    };
    return {
      prepared,
      db: {
        prepare: (sql: string) => stmt(sql),
        async batch(stmts: { sql: string }[]) {
          return stmts.map((s) =>
            s.sql.includes("item_sources")
              ? { results: [] }
              : { results: [base] }
          );
        },
      } as unknown as Parameters<typeof getStory>[0],
    };
  }

  it("reads at most 12 rows, newest first, and coerces created_at with Number", async () => {
    const { db, prepared } = contentLogDb([
      {
        field: "title",
        lang: "en",
        before_text: "Old title",
        after_text: "New title",
        reason: "ingest",
        created_at: "1700000002",
      },
      {
        field: "summary",
        lang: "vi",
        before_text: "Tóm tắt cũ",
        after_text: "Tóm tắt mới",
        reason: "backfill",
        created_at: "1700000001",
      },
    ]);
    const item = await getStory(db, "abcdef12");
    const logSql = prepared.find((sql) => sql.includes("item_content_log"));
    expect(logSql).toContain("ORDER BY created_at DESC, id DESC");
    expect(logSql).toContain("LIMIT 12");
    expect(item?.content_log).toEqual([
      {
        field: "title",
        lang: "en",
        before_text: "Old title",
        after_text: "New title",
        reason: "ingest",
        created_at: 1700000002,
      },
      {
        field: "summary",
        lang: "vi",
        before_text: "Tóm tắt cũ",
        after_text: "Tóm tắt mới",
        reason: "backfill",
        created_at: 1700000001,
      },
    ]);
    expect(item?.content_log?.map((entry) => typeof entry.created_at)).toEqual([
      "number",
      "number",
    ]);
  });

  it("omits content_log when item_content_log does not exist", async () => {
    const { db } = contentLogDb(new Error("no such table: item_content_log"));
    const item = await getStory(db, "abcdef12");
    expect(item?.id).toBe(base.id);
    expect(item?.content_log).toBeUndefined();
  });
});
