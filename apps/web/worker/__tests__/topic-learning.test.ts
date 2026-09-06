import { describe, expect, it } from "vitest";
import {
  collectTrendingCandidates,
  displayKeywordFromTopic,
  extractTitleEntities,
  isLearnableEntityTopic,
  isSpecificTrendingTopic,
  learningDayKey,
  rankTrendingWithGrowth,
  trendingKey,
} from "../topic-learning.js";

describe("learningDayKey", () => {
  it("returns YYYY-MM-DD in Asia/Ho_Chi_Minh", () => {
    // 2026-09-04 17:00 UTC = 2026-09-05 00:00 ICT
    expect(learningDayKey(Date.UTC(2026, 8, 4, 17, 0, 0))).toBe("2026-09-05");
  });
});

describe("isLearnableEntityTopic", () => {
  it("accepts entity-like model and product names", () => {
    expect(isLearnableEntityTopic("claude-code")).toBe(true);
    expect(isLearnableEntityTopic("gpt-5")).toBe(true);
    expect(isLearnableEntityTopic("openrouter")).toBe(true);
  });

  it("rejects generic themes and noise", () => {
    expect(isLearnableEntityTopic("llm")).toBe(false);
    expect(isLearnableEntityTopic("agent")).toBe(false);
    expect(isLearnableEntityTopic("ai")).toBe(false);
    expect(isLearnableEntityTopic("42")).toBe(false);
  });
});

describe("extractTitleEntities", () => {
  it("pulls GPT-6 Astra and versioned models from headlines", () => {
    expect(
      extractTitleEntities(
        "UPDATE: Venice Adds GPT-6 Astra With Anonymized Access"
      )
    ).toEqual(expect.arrayContaining(["GPT-6 Astra"]));
    expect(
      extractTitleEntities("OpenAI Releases GPT-6 Astra With 169 Epoch Record")
    ).toEqual(expect.arrayContaining(["GPT-6 Astra"]));
    expect(
      extractTitleEntities("Unsloth Boosts Local GLM-5.3-Flash Speed 3.3x")
    ).toEqual(expect.arrayContaining(["GLM-5.3-Flash"]));
    expect(
      extractTitleEntities("Zhi-Wei Sun Sets Prime Gaps With GPT-5.6 Sol AI")
    ).toEqual(expect.arrayContaining(["GPT-5.6 Sol"]));
  });

  it("pulls Fable / Muse Spark / Claude Opus style names", () => {
    expect(extractTitleEntities("Anthropic ships Fable 5.1 today")).toEqual(
      expect.arrayContaining(["Fable 5.1"])
    );
    expect(
      extractTitleEntities("Meta Releases Muse Spark 1.3 Max for Reasoning")
    ).toEqual(expect.arrayContaining(["Muse Spark 1.3 Max"]));
    expect(
      extractTitleEntities("GitHub HydraFusion vs Claude Opus 5 Benchmark")
    ).toEqual(expect.arrayContaining(["Claude Opus 5"]));
  });
});

describe("displayKeywordFromTopic", () => {
  it("title-cases kebab topics and uppercases known acronyms", () => {
    expect(displayKeywordFromTopic("claude-code")).toBe("Claude Code");
    expect(displayKeywordFromTopic("gpt")).toBe("GPT");
    expect(displayKeywordFromTopic("mcp")).toBe("MCP");
    expect(displayKeywordFromTopic("gpt-6-astra")).toBe("GPT-6 Astra");
  });
});

describe("rankTrendingWithGrowth", () => {
  it("prefers rising specific models over generic themes", () => {
    const today = new Map([
      ["openai", 4],
      ["GPT-6 Astra", 5],
      ["llm", 13],
      ["agent", 13],
    ]);
    const yesterday = new Map([
      ["openai", 4],
      ["gpt-6-astra", 1],
      ["llm", 12],
    ]);
    const ranked = rankTrendingWithGrowth(today, yesterday, {
      hotMin: 2,
      floor: 3,
      cap: 8,
    });
    expect(ranked[0]?.tag).toBe("GPT-6 Astra");
    expect(ranked.map((r) => r.tag)).not.toContain("llm");
    expect(ranked.map((r) => r.tag)).not.toContain("agent");
  });

  it("fills to floor on quiet days with learnable entities", () => {
    const today = new Map([
      ["openai", 1],
      ["anthropic", 1],
      ["cursor", 1],
    ]);
    const ranked = rankTrendingWithGrowth(today, new Map(), {
      hotMin: 2,
      floor: 3,
      cap: 8,
    });
    // cursor is specific (codename); labs fill the rest
    expect(ranked.map((r) => r.tag)).toEqual(
      expect.arrayContaining(["cursor", "openai", "anthropic"])
    );
    expect(ranked).toHaveLength(3);
  });

  it("lists versioned models before bare labs when both are hot", () => {
    const today = new Map([
      ["openai", 12],
      ["GPT-6 Astra", 6],
      ["Fable 5.1", 3],
      ["llm", 20],
    ]);
    const ranked = rankTrendingWithGrowth(today, new Map(), {
      hotMin: 2,
      floor: 8,
      cap: 16,
    });
    expect(ranked[0]?.tag).toBe("GPT-6 Astra");
    expect(ranked.map((r) => r.tag).slice(0, 2)).toEqual(
      expect.arrayContaining(["GPT-6 Astra", "Fable 5.1"])
    );
    const openaiIdx = ranked.findIndex((r) => r.tag === "openai");
    const fableIdx = ranked.findIndex((r) => r.tag === "Fable 5.1");
    expect(fableIdx).toBeGreaterThanOrEqual(0);
    expect(fableIdx).toBeLessThan(openaiIdx === -1 ? 99 : openaiIdx);
  });
});

describe("collectTrendingCandidates", () => {
  it("counts title entities even when tags are generic", () => {
    const { counts, displayByKey } = collectTrendingCandidates(
      [
        {
          title: "OpenAI Releases GPT-6 Astra With 169 Epoch Record",
          tags: ["openai", "gpt", "llm", "agent"],
          published_at: 1_700_000_000,
        },
        {
          title: "GPT-6 Astra on OpenRouter",
          tags: ["openai", "gpt", "llm"],
          published_at: 1_700_000_100,
        },
        {
          title: "Anthropic ships Fable 5.1",
          tags: ["anthropic", "claude"],
          published_at: 1_700_000_200,
        },
      ],
      1_699_000_000
    );
    expect(counts.get(trendingKey("GPT-6 Astra"))).toBe(2);
    expect(displayByKey.get(trendingKey("GPT-6 Astra"))).toBe("GPT-6 Astra");
    expect(counts.get(trendingKey("Fable 5.1"))).toBe(1);
    expect(counts.has("llm")).toBe(false);
    expect(isSpecificTrendingTopic("GPT-6 Astra")).toBe(true);
  });
});
