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
  it("targets published rows with a summary but no usable legacy media", () => {
    const sql = buildMissingMediaQuery(9);
    expect(sql).toContain("status = 'published'");
    expect(sql).toMatch(/summary IS NOT NULL AND summary != ''/);
    expect(sql).toMatch(/image_url IS NULL OR image_url = ''/);
    expect(sql).toMatch(
      /media_manifest IS NULL OR media_manifest = '' OR media_manifest = '\[\]'/
    );
    expect(sql).toContain("ORDER BY published_at DESC");
    expect(sql).toContain("LIMIT 9");
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

  it("falls back to null imageUrl when neither existing nor fetched has one", () => {
    const plan = planBackfillUpdate(
      { imageUrl: null },
      { summary: "A fetched summary" }
    );
    expect(plan?.imageUrl).toBeNull();
  });
});
