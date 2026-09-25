import { describe, expect, it } from "vitest";
import {
  buildItemBindArgs,
  buildItemSourceBindArgs,
  buildTranslationBindArgs,
  ITEM_BIND_ARITY,
  ITEM_MEDIA_MANIFEST_BIND_INDEX,
  ITEM_SOURCE_LANG_BIND_INDEX,
  MAX_SOURCES_PER_ITEM,
  nn,
  TRANSLATION_BIND_ARITY,
  TRANSLATION_QA_INVALIDATION_SQL,
  TRANSLATION_UPSERT_SQL,
} from "../d1-bind.js";
import type { FetchedItemSource } from "../sources/types.js";

describe("nn", () => {
  it("coerces undefined and null to null, passes through other values", () => {
    expect(nn(undefined)).toBeNull();
    expect(nn(null)).toBeNull();
    expect(nn(0)).toBe(0);
    expect(nn("")).toBe("");
    expect(nn("x")).toBe("x");
  });
});

describe("buildItemBindArgs", () => {
  it("never contains undefined for an item missing all optional fields", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "A story with no summary or points",
        publishedAt: 1700000000, // already epoch seconds
        // externalId, summary, points, comments all omitted
      },
      // score omitted entirely (e.g. LLM batch failed and was skipped)
      rank: 0,
      status: "published",
      now: 1700000100000, // Date.now()-style, epoch ms
    });

    expect(args).not.toContain(undefined);
    // optional fields fall back to null / 0, never undefined
    expect(args).toEqual([
      "abc123",
      "hn",
      null, // externalId
      "https://example.com/story",
      "A story with no summary or points",
      null, // summary
      1700000000, // published_at, seconds
      1700000100, // fetched_at, normalized from ms `now` to seconds
      0, // points
      0, // comments
      null, // llm_relevance
      null, // llm_importance
      null, // llm_quality
      null, // category
      "[]", // tags
      0, // rank
      "published",
      0, // llm_tokens, defaulted since llmTokens was omitted
      null, // duplicate_of, defaulted since duplicateOf was omitted
      null, // image_url, item.imageUrl was omitted
      "en", // explicit source language
      '{"version":1,"assets":[]}', // media_manifest
    ]);
    expect(args).toHaveLength(ITEM_BIND_ARITY);
    expect(args[ITEM_SOURCE_LANG_BIND_INDEX]).toBe("en");
    expect(ITEM_MEDIA_MANIFEST_BIND_INDEX).toBe(ITEM_BIND_ARITY - 1);
  });

  it("passes through llm scores when present, including a zero relevance", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
      },
      score: {
        relevance: 0,
        importance: 5,
        quality: 7,
        category: "Models",
        tags: ["gpt"],
      },
      rank: 3.2,
      status: "rejected",
      now: 1700000100000,
    });

    expect(args).not.toContain(undefined);
    expect(args[10]).toBe(0); // llm_relevance must stay 0, not become null
    expect(args[13]).toBe("Models");
    expect(args[14]).toBe(JSON.stringify(["gpt"]));
  });

  it("normalizes a millisecond publishedAt (e.g. an unfixed adapter) down to seconds", () => {
    // Regression: HuggingNews originally emitted epoch milliseconds for
    // publishedAt, which stored directly produced nonsense future dates.
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "huggingnews",
      item: {
        url: "https://huggingnews.com/ai/some-story",
        title: "Some story",
        publishedAt: 1786847892625, // ms
      },
      rank: 1,
      status: "published",
      now: 1786847892625,
    });

    expect(args[6]).toBe(1786847892); // published_at, coerced to seconds
    expect(args[7]).toBe(1786847892); // fetched_at, coerced to seconds
  });

  it("includes llm_tokens with no undefined when provided", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
      },
      rank: 1,
      status: "published",
      now: 1700000100000,
      llmTokens: 342,
    });

    expect(args).not.toContain(undefined);
    expect(args[17]).toBe(342);
  });

  it("defaults llm_tokens to 0, never undefined, when omitted", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
      },
      rank: 1,
      status: "published",
      now: 1700000100000,
      // llmTokens omitted
    });

    expect(args).not.toContain(undefined);
    expect(args[17]).toBe(0); // llm_tokens
    expect(args[18]).toBeNull(); // duplicate_of
    expect(args[19]).toBeNull(); // image_url
    expect(args[20]).toBe("en"); // source_lang
    expect(args[21]).toBe('{"version":1,"assets":[]}');
  });

  it("includes duplicate_of with no undefined when the item is merged", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
      },
      rank: 1,
      status: "merged",
      now: 1700000100000,
      duplicateOf: "canonical-id-456",
    });

    expect(args).not.toContain(undefined);
    expect(args[18]).toBe("canonical-id-456");
  });

  it("derives legacy image_url from the first manifest image", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
        mediaManifest: {
          version: 1,
          assets: [{ type: "image", url: "https://example.com/manifest.png" }],
        },
      },
      rank: 1,
      status: "published",
      now: 1700000100000,
    });

    expect(args[19]).toBe("https://example.com/manifest.png");
    expect(args[ITEM_SOURCE_LANG_BIND_INDEX]).toBe("en");
    expect(JSON.parse(args[ITEM_MEDIA_MANIFEST_BIND_INDEX] as string)).toEqual({
      version: 1,
      assets: [{ type: "image", url: "https://example.com/manifest.png" }],
    });
  });

  it("derives legacy image_url from a video poster without duplicating it", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
        mediaManifest: {
          version: 1,
          assets: [
            {
              type: "video",
              url: "https://example.com/story.mp4",
              poster_url: "https://example.com/poster.jpg",
            },
          ],
        },
      },
      rank: 1,
      status: "published",
      now: 1700000100000,
    });

    expect(args[19]).toBe("https://example.com/poster.jpg");
    expect(args[ITEM_SOURCE_LANG_BIND_INDEX]).toBe("en");
    expect(JSON.parse(args[ITEM_MEDIA_MANIFEST_BIND_INDEX] as string)).toEqual({
      version: 1,
      assets: [
        {
          type: "video",
          url: "https://example.com/story.mp4",
          poster_url: "https://example.com/poster.jpg",
        },
      ],
    });
  });

  it("does not persist an article URL accidentally classified as media", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/article",
        title: "Title",
        publishedAt: 1700000000,
        mediaManifest: {
          version: 1,
          assets: [{ type: "image", url: "https://example.com/article" }],
        },
      },
      rank: 1,
      status: "published",
      now: 1700000100000,
    });
    expect(args[19]).toBeNull();
    expect(args[ITEM_SOURCE_LANG_BIND_INDEX]).toBe("en");
    expect(JSON.parse(args[ITEM_MEDIA_MANIFEST_BIND_INDEX] as string)).toEqual({
      version: 1,
      assets: [],
    });
  });

  it("includes image_url with no undefined when the item has one", () => {
    const args = buildItemBindArgs({
      id: "abc123",
      sourceId: "hn",
      item: {
        url: "https://example.com/story",
        title: "Title",
        publishedAt: 1700000000,
        imageUrl: "https://example.com/og.png",
      },
      rank: 1,
      status: "published",
      now: 1700000100000,
    });

    expect(args).not.toContain(undefined);
    expect(args[19]).toBe("https://example.com/og.png");
    expect(args[ITEM_SOURCE_LANG_BIND_INDEX]).toBe("en");
    expect(args[ITEM_MEDIA_MANIFEST_BIND_INDEX]).toBe(
      '{"version":1,"assets":[]}'
    );
  });
});

describe("buildItemSourceBindArgs", () => {
  it("never contains undefined for a source missing every optional field", () => {
    const rows = buildItemSourceBindArgs("abc123", [{ kind: "source" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toContain(undefined);
    expect(rows[0]).toEqual([
      "abc123",
      0, // position
      "source",
      null, // author
      null, // posted_at
      null, // quote
      null, // url
    ]);
  });

  it("assigns 0-based positions in input order", () => {
    const sources: FetchedItemSource[] = [
      { kind: "discussion", url: "https://a" },
      { kind: "source", url: "https://b" },
      { kind: "support", url: "https://c" },
    ];
    const rows = buildItemSourceBindArgs("abc123", sources);
    expect(rows.map((r) => r[1])).toEqual([0, 1, 2]);
    expect(rows.map((r) => r[2])).toEqual(["discussion", "source", "support"]);
  });

  it("normalizes a millisecond postedAt to seconds", () => {
    const rows = buildItemSourceBindArgs("abc123", [
      { kind: "source", postedAt: 1786720391000 },
    ]);
    expect(rows[0][4]).toBe(1786720391);
  });

  it("caps at MAX_SOURCES_PER_ITEM, dropping the rest", () => {
    const sources: FetchedItemSource[] = Array.from({ length: 12 }, (_, i) => ({
      kind: "support" as const,
      url: `https://example.com/${i}`,
    }));
    const rows = buildItemSourceBindArgs("abc123", sources);
    expect(rows).toHaveLength(MAX_SOURCES_PER_ITEM);
    expect(rows[rows.length - 1][6]).toBe(
      `https://example.com/${MAX_SOURCES_PER_ITEM - 1}`
    );
  });
});

describe("buildTranslationBindArgs", () => {
  it("never contains undefined", () => {
    const args = buildTranslationBindArgs({
      id: "abc123",
      title: "Tiêu đề",
      summary: "Tóm tắt",
    });
    expect(args).not.toContain(undefined);
    expect(args).toEqual(["abc123", "vi", "en", "vi", "Tiêu đề", "Tóm tắt"]);
    expect(args).toHaveLength(TRANSLATION_BIND_ARITY);
  });
});

describe("translation QA invalidation SQL", () => {
  it("clears every current-review marker when a candidate is rewritten", () => {
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_rating = NULL");
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_source_hash = NULL");
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_source_revision = NULL");
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_candidate_hash = NULL");
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_direction = NULL");
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_reviewer_model = NULL");
    expect(TRANSLATION_UPSERT_SQL).toContain("qa_criteria_version = NULL");
  });

  it("invalidates the candidate marker when only its source changes", () => {
    expect(TRANSLATION_QA_INVALIDATION_SQL).toContain(
      "qa_candidate_hash = NULL"
    );
    expect(TRANSLATION_QA_INVALIDATION_SQL).toContain("WHERE item_id = ?");
  });
});
