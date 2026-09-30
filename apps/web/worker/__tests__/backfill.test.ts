import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  BACKFILL_TRANSLATE_CAP,
  buildMissingMediaQuery,
  buildMissingSummaryQuery,
  buildMissingTranslationQuery,
  buildUnscoredItemsQuery,
  huggingNewsDetailUrl,
  planBackfillUpdate,
} from "../backfill.js";

describe("buildMissingSummaryQuery", () => {
  it("gates on status='published' and empty/null summary", () => {
    const sql = buildMissingSummaryQuery(15);
    expect(sql).toContain("status = 'published'");
    expect(sql).toMatch(/summary IS NULL OR summary = ''/);
    expect(sql).toContain("media_manifest");
  });

  it("orders most-recent-first and respects the given limit", () => {
    const sql = buildMissingSummaryQuery(7);
    expect(sql).toMatch(/ORDER BY published_at DESC/);
    expect(sql).toContain("LIMIT 7");
  });

  it("defaults to the standard cap when no limit is given", () => {
    expect(buildMissingSummaryQuery()).toContain("LIMIT 15");
  });
});

describe("buildMissingMediaQuery", () => {
  // Executes the predicate. A string-shape assertion cannot catch a filter
  // that still drops a legacy image_url row with an empty manifest.
  function selectedIds(rows: ReadonlyArray<Record<string, unknown>>): string[] {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          url TEXT,
          source_id TEXT,
          status TEXT,
          summary TEXT,
          image_url TEXT,
          media_manifest TEXT NOT NULL DEFAULT '[]',
          published_at INTEGER
        );
      `);
      const insert = db.prepare(
        `INSERT INTO items (id, url, source_id, status, summary, image_url, media_manifest, published_at)
         VALUES (?, ?, 'hn', ?, ?, ?, ?, ?)`
      );
      for (const row of rows) {
        // `null` and `undefined` must both land as SQL NULL; String(null)
        // would store the literal text "null" and quietly pass a gate test.
        const text = (value: unknown): string | null =>
          value === null || value === undefined ? null : String(value);
        insert.run(
          String(row.id),
          `https://example.com/${String(row.id)}`,
          String(row.status),
          text(row.summary),
          text(row.image_url),
          text(row.media_manifest) ?? "[]",
          Number(row.published_at ?? 0)
        );
      }
      const found = db.prepare(buildMissingMediaQuery(1000)).all() as Array<{
        id: string;
      }>;
      return found.map((row) => row.id);
    } finally {
      db.close();
    }
  }

  const populated = JSON.stringify({
    version: 1,
    assets: [{ type: "image", url: "https://cdn.example/hero.jpg" }],
  });

  it("now selects a published row with a legacy image_url and an empty manifest", () => {
    expect(
      selectedIds([
        {
          id: "legacy-image-empty-manifest",
          status: "published",
          summary: "A real summary",
          image_url: "https://legacy.example/pre-0024.jpg",
          media_manifest: "[]",
          published_at: 10,
        },
      ])
    ).toEqual(["legacy-image-empty-manifest"]);
  });

  it("still selects rows with no image_url at all", () => {
    expect(
      selectedIds([
        {
          id: "no-image",
          status: "published",
          summary: "A real summary",
          image_url: null,
          media_manifest: "[]",
          published_at: 10,
        },
      ])
    ).toEqual(["no-image"]);
  });

  it("never selects a row whose manifest is already populated", () => {
    expect(
      selectedIds([
        {
          id: "populated",
          status: "published",
          summary: "A real summary",
          image_url: null,
          media_manifest: populated,
          published_at: 20,
        },
        {
          id: "populated-with-image",
          status: "published",
          summary: "A real summary",
          image_url: "https://legacy.example/pre-0024.jpg",
          media_manifest: populated,
          published_at: 21,
        },
      ])
    ).toEqual([]);
  });

  it("still honours the published and non-empty-summary gates", () => {
    expect(
      selectedIds([
        {
          id: "draft",
          status: "draft",
          summary: "A real summary",
          image_url: null,
          media_manifest: "[]",
          published_at: 30,
        },
        {
          id: "no-summary",
          status: "published",
          summary: "",
          image_url: null,
          media_manifest: "[]",
          published_at: 31,
        },
        {
          id: "null-summary",
          status: "published",
          summary: null,
          image_url: null,
          media_manifest: "[]",
          published_at: 32,
        },
      ])
    ).toEqual([]);
  });

  it("stays bounded and drains most-recent-first", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          url TEXT,
          source_id TEXT,
          status TEXT,
          summary TEXT,
          image_url TEXT,
          media_manifest TEXT NOT NULL DEFAULT '[]',
          published_at INTEGER
        );
      `);
      const insert = db.prepare(
        `INSERT INTO items (id, url, source_id, status, summary, image_url, media_manifest, published_at)
         VALUES (?, ?, 'hn', 'published', 'A real summary', 'https://legacy.example/a.jpg', '[]', ?)`
      );
      for (let i = 0; i < 40; i++) {
        insert.run(`row-${i}`, `https://example.com/${i}`, i);
      }
      const found = db.prepare(buildMissingMediaQuery(15)).all() as Array<{
        id: string;
      }>;

      // Bounded to the requested cap, and ordered most-recent-first.
      expect(found).toHaveLength(15);
      expect(found[0]?.id).toBe("row-39");
      expect(found.at(-1)?.id).toBe("row-25");
    } finally {
      db.close();
    }
  });

  it("targets published rows with a summary but no media manifest", () => {
    const sql = buildMissingMediaQuery(9);
    expect(sql).toContain("status = 'published'");
    expect(sql).toMatch(/summary IS NOT NULL AND summary != ''/);
    expect(sql).toMatch(
      /media_manifest IS NULL OR media_manifest = '' OR media_manifest = '\[\]'/
    );
    expect(sql).toContain("ORDER BY published_at DESC");
    expect(sql).toContain("LIMIT 9");
  });

  it("does not require a legacy image_url, so enriched rows stay reachable", () => {
    // Issue #207: gating on `image_url` being empty excluded every row that
    // already had a legacy og:image, which is exactly the set that needs a
    // media_manifest built. The column is still selected as manifest input.
    const sql = buildMissingMediaQuery();
    expect(sql).not.toMatch(/image_url IS NULL OR image_url = ''/);
    expect(sql).toContain("image_url");
  });
});

describe("BACKFILL_TRANSLATE_CAP", () => {
  it("defaults the missing-translation query to the raised hourly cap", () => {
    expect(BACKFILL_TRANSLATE_CAP).toBe(45);
    expect(buildMissingTranslationQuery()).toContain("LIMIT 45");
  });
});

describe("buildMissingTranslationQuery", () => {
  it("gates on published items missing a non-empty vi title", () => {
    const sql = buildMissingTranslationQuery(15);
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain("i.source_lang = 'en'");
    expect(sql).not.toMatch(/i\.summary IS NOT NULL AND i\.summary != ''/);
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("lang = 'vi'");
    expect(sql).toMatch(/t\.title IS NOT NULL AND t\.title != ''/);
  });

  it("respects the given limit", () => {
    expect(buildMissingTranslationQuery(3)).toContain("LIMIT 3");
  });
});

describe("buildUnscoredItemsQuery", () => {
  it("gates on published items with empty category and tags", () => {
    const sql = buildUnscoredItemsQuery(15);
    expect(sql).toContain("status = 'published'");
    expect(sql).toMatch(/category IS NULL OR category = ''/);
    expect(sql).toMatch(/tags = '\[]'/);
  });

  it("orders most-recent-first and respects the given limit", () => {
    const sql = buildUnscoredItemsQuery(4);
    expect(sql).toMatch(/ORDER BY published_at DESC/);
    expect(sql).toContain("LIMIT 4");
  });
});

describe("huggingNewsDetailUrl", () => {
  it("appends /__data.json to the item's own canonical url", () => {
    expect(
      huggingNewsDetailUrl("https://huggingnews.com/ai/some-story-abc123")
    ).toBe("https://huggingnews.com/ai/some-story-abc123/__data.json");
  });
});

describe("planBackfillUpdate", () => {
  it("returns null when nothing usable was fetched (leaves item for next run)", () => {
    expect(planBackfillUpdate({ imageUrl: null }, {})).toBeNull();
    expect(
      planBackfillUpdate(
        { imageUrl: null },
        { imageUrl: "http://127.0.0.1/private.png" }
      )
    ).toBeNull();
  });

  it("accepts a media-only backfill and keeps the existing summary", () => {
    const plan = planBackfillUpdate(
      { summary: "Existing summary", imageUrl: null },
      { imageUrl: "https://x.com/i.png" }
    );
    expect(plan).toEqual({
      summary: "Existing summary",
      imageUrl: "https://x.com/i.png",
      mediaManifest: {
        version: 1,
        assets: [{ type: "image", url: "https://x.com/i.png" }],
      },
    });
  });

  it("writes the fetched summary when there's no existing image", () => {
    const plan = planBackfillUpdate(
      { imageUrl: null },
      { summary: "A fetched summary", imageUrl: "https://x.com/i.png" }
    );
    expect(plan).toEqual({
      summary: "A fetched summary",
      imageUrl: "https://x.com/i.png",
      mediaManifest: {
        version: 1,
        assets: [{ type: "image", url: "https://x.com/i.png" }],
      },
    });
  });

  it("preserves a fetched bounded media manifest", () => {
    const plan = planBackfillUpdate(
      { imageUrl: null },
      {
        summary: "A fetched summary",
        mediaManifest: {
          version: 1,
          assets: [
            { type: "image", url: "https://x.com/hero.jpg" },
            { type: "video", url: "https://x.com/story.mp4" },
          ],
        },
      }
    );
    expect(plan?.mediaManifest?.assets).toHaveLength(2);
  });

  it("preserves and merges a richer existing manifest on backfill", () => {
    const plan = planBackfillUpdate(
      {
        imageUrl: "https://existing.com/original.png",
        mediaManifest: JSON.stringify({
          version: 1,
          assets: [
            {
              type: "video",
              url: "https://existing.com/story.mp4",
              poster_url: "https://existing.com/poster.png",
            },
          ],
        }),
      },
      {
        summary: "Fetched",
        mediaManifest: {
          version: 1,
          assets: [{ type: "image", url: "https://new.com/alternate.png" }],
        },
      }
    );
    expect(plan?.imageUrl).toBe("https://existing.com/poster.png");
    expect(plan?.mediaManifest?.assets).toEqual([
      {
        type: "video",
        url: "https://existing.com/story.mp4",
        poster_url: "https://existing.com/poster.png",
      },
      { type: "image", url: "https://new.com/alternate.png" },
    ]);
  });

  it("never overwrites a non-empty existing image_url with a freshly-fetched one", () => {
    const plan = planBackfillUpdate(
      { imageUrl: "https://existing.com/original.png" },
      { summary: "A fetched summary", imageUrl: "https://x.com/new.png" }
    );
    expect(plan?.imageUrl).toBe("https://existing.com/original.png");
  });

  it("keeps a finished summary when the fetch is cut off", () => {
    const plan = planBackfillUpdate(
      { summary: "Revenue climbed to $4.59 billion.", imageUrl: null },
      { summary: "An IPO prospectus seen by Reu…" }
    );
    expect(plan?.summary).toBe("Revenue climbed to $4.59 billion.");
  });

  it("replaces a cut-off summary with a finished fetch", () => {
    const plan = planBackfillUpdate(
      { summary: "An IPO prospectus seen by Reu…", imageUrl: null },
      {
        summary:
          "An IPO prospectus seen by Reuters put the loss at $41.97 billion.",
      }
    );
    expect(plan?.summary).toBe(
      "An IPO prospectus seen by Reuters put the loss at $41.97 billion."
    );
  });

  it("falls back to null imageUrl when neither existing nor fetched has one", () => {
    const plan = planBackfillUpdate(
      { imageUrl: null },
      { summary: "A fetched summary" }
    );
    expect(plan?.imageUrl).toBeNull();
  });
});
