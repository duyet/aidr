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
  trendingSourceWeight,
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

describe("extractTitleEntities builder frameworks", () => {
  it("names frameworks, SDKs, and platforms that carry no version", () => {
    expect(
      extractTitleEntities("CrewAI raises $40M to build agent teams")
    ).toEqual(["CrewAI"]);
    expect(
      extractTitleEntities("Cloudflare expands Workers AI with new models")
    ).toEqual(["Workers AI"]);
    expect(
      extractTitleEntities("OpenAI Agents SDK adds sandbox execution")
    ).toEqual(["OpenAI Agents SDK"]);
    expect(
      extractTitleEntities("Meta ships Llama Stack for local agents")
    ).toEqual(["Llama Stack"]);
    expect(extractTitleEntities("Pydantic AI adds durable execution")).toEqual([
      "Pydantic AI",
    ]);
    expect(extractTitleEntities("AutoGen and DSPy compared")).toEqual(
      expect.arrayContaining(["AutoGen", "DSPy"])
    );
  });

  it("keeps the model name from a Workers AI model id", () => {
    expect(
      extractTitleEntities(
        "Run @cf/meta/llama-4-scout-17b-16e-instruct on Workers AI"
      )
    ).toEqual(["Workers AI", "llama-4-scout-17b-16e-instruct"]);
  });

  it("treats one-word framework names as trending topics, not category words", () => {
    for (const name of ["langgraph", "crewai", "mastra", "workers-ai"]) {
      expect(isSpecificTrendingTopic(name), name).toBe(true);
    }
    for (const name of ["tools", "frameworks", "data", "data-engineering"]) {
      expect(isSpecificTrendingTopic(name), name).toBe(false);
    }
  });
});

describe("extractTitleEntities generic rules", () => {
  it("does not glue a following lowercase word onto a version (glm-5.3-nearly)", () => {
    const out = extractTitleEntities(
      "Anthropic says Zhipu's open-weight GLM-5.3 nearly matches Claude Mythos Preview"
    );
    expect(out).toContain("GLM-5.3");
    expect(out.map(trendingKey)).not.toContain("glm-5.3-nearly");
  });

  it("keeps only tier words after a version in Title Case headlines", () => {
    expect(
      extractTitleEntities(
        "Grok 4.7 Tops First Enterprise AI Cyber Defense Index"
      )
    ).toEqual(["Grok 4.7"]);
    expect(
      extractTitleEntities(
        "SpaceXAI Launches Grok Imagine Video 1.5 Lite on fal"
      )
    ).toEqual(["Grok Imagine Video 1.5 Lite"]);
  });

  it("finds name + version for families it has never seen", () => {
    expect(
      extractTitleEntities("Black Forest Labs Ships FLUX 3 Image for Editing")
    ).toEqual(["FLUX 3"]);
    expect(
      extractTitleEntities(
        "Physis-Lang Lifts Cosmos 3 Past Veo 3.1 on Physics Benchmarks"
      )
    ).toEqual(expect.arrayContaining(["Cosmos 3", "Veo 3.1"]));
    expect(
      extractTitleEntities("Kling AI Launches Kling 4.0 with 30 Second Video")
    ).toEqual(expect.arrayContaining(["Kling 4.0"]));
  });

  it("does not take headline verbs, labs or gerunds into a name", () => {
    expect(
      extractTitleEntities("OpenAI Cancels GPT-6 Astra 1 Day Before")
    ).toEqual(["GPT-6 Astra"]);
    expect(extractTitleEntities("Prompting Claude Opus 5.5")).toEqual([
      "Claude Opus 5.5",
    ]);
    expect(
      extractTitleEntities("Google Gemini 4's Coding Skills Trail")
    ).toEqual(["Gemini 4"]);
  });

  it("treats sizes, counts, years, quarters and dates as numbers, not versions", () => {
    for (const title of [
      "Overmind's 9B Models Outperform Rivals",
      "Tesla Cuts Chip RAM to 72GB",
      "Nvidia and SoftBank Deliver Final $20B for OpenAI March Round",
      "Barclays Targets 50% Developer Adoption by 2026",
      "Accenture Shares Jump 20% After Q4 Margins Beat AI Fears",
      "Microsoft and Nvidia Set Oct 7 Event",
      "OpenAI Notifies More Than 100 Organizations",
      "OpenAI Fires 3 Safety Researchers",
    ]) {
      expect(extractTitleEntities(title)).toEqual([]);
    }
  });

  it("skips the generic version rule on Vietnamese headlines", () => {
    expect(
      extractTitleEntities("Hacker 17 tuổi tạo trợ lý AI thâm nhập nền tảng")
    ).toEqual([]);
    expect(
      extractTitleEntities("Google ra Gemini 4 Argon mạnh nhất của công ty")
    ).toEqual(["Gemini 4 Argon"]);
  });

  it("drops a name contained in a longer one from the same title", () => {
    expect(
      extractTitleEntities(
        "Adaption AI Beats GPT 5.6 and Claude Opus 5 in Data Synthesis"
      )
    ).toEqual(["GPT 5.6", "Claude Opus 5"]);
  });

  it("pulls coined mixed-case names but not labs, owners or organisations", () => {
    expect(
      extractTitleEntities(
        "LangChain Launches LangSmith Fine-Tuning to Turn Traces"
      )
    ).toEqual(["LangSmith Fine-Tuning"]);
    expect(extractTitleEntities("ChatGPT can now try on clothes")).toEqual([
      "ChatGPT",
    ]);
    expect(
      extractTitleEntities("MongoDB Stock Plummets 15% on CEO Move")
    ).toEqual(["MongoDB"]);
    expect(
      extractTitleEntities("OpenID Foundation: Identity for Agentic AI")
    ).toEqual([]);
    expect(
      extractTitleEntities("20 Agentic Use Cases of TypeSafe AI's Jev")
    ).toEqual([]);
  });

  it("reads a short name before a headline colon or after a launch verb", () => {
    expect(
      extractTitleEntities(
        "GPT-Synopsys: Frontier Intelligence for Chip Design"
      )
    ).toEqual(["GPT-Synopsys"]);
    expect(
      extractTitleEntities("NVIDIA Releases Kumo Tabular: Open Tabular Models")
    ).toEqual(["Kumo Tabular"]);
    expect(extractTitleEntities("Show HN: a tiny agent")).toEqual([]);
    expect(
      extractTitleEntities(
        "Allen AI Releases Open Training Stack for MoE Models"
      )
    ).toEqual([]);
    expect(
      extractTitleEntities("FTC Launches Sweeping AI Probe of OpenAI")
    ).toEqual([]);
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

describe("rankTrendingWithGrowth filler", () => {
  it("fills with single-mention models before bare labs", () => {
    const ranked = rankTrendingWithGrowth(
      new Map([
        ["gemini-4-argon", 7],
        ["flux-3", 1],
        ["olmo-core-3", 1],
        ["openai", 23],
        ["nvidia", 14],
      ]),
      new Map(),
      { floor: 3 }
    );
    expect(ranked.map((r) => r.tag)).toEqual([
      "gemini-4-argon",
      "flux-3",
      "olmo-core-3",
    ]);
  });

  it("never lets business-theme tags become chips", () => {
    const { counts } = collectTrendingCandidates(
      [
        {
          title: "Cerebras CFO Joins COO in Stock Sales",
          tags: [
            "cerebras",
            "stock-sales",
            "executive-departures",
            "industry-news",
          ],
          published_at: 1_700_000_000,
        },
      ],
      1_699_000_000
    );
    expect([...counts.keys()]).toEqual(["cerebras"]);
  });
});

describe("rankTrendingWithGrowth entityKeys", () => {
  it("treats headline-extracted single words as specific, over labs and tag themes", () => {
    const { counts, entityKeys } = collectTrendingCandidates(
      [
        {
          title: "ChatGPT can now try on clothes",
          tags: ["openai", "daily-active-users"],
          published_at: 1_700_000_000,
        },
        {
          title: "OpenAI ships a pricing page",
          tags: ["openai", "stock-market"],
          published_at: 1_700_000_100,
        },
      ],
      1_699_000_000
    );
    expect(entityKeys.has("chatgpt")).toBe(true);
    const ranked = rankTrendingWithGrowth(counts, new Map(), {
      floor: 2,
      entityKeys,
    }).map((r) => r.tag);
    expect(ranked[0]).toBe("chatgpt");
    expect(ranked).not.toContain("daily-active-users");
    expect(ranked).not.toContain("stock-market");
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

  it("weights a merged multi-source story above a single-source mention", () => {
    expect(trendingSourceWeight(undefined)).toBe(1);
    expect(trendingSourceWeight(4)).toBe(4);
    expect(trendingSourceWeight(20)).toBe(8);
    const { counts } = collectTrendingCandidates(
      [
        {
          title: "OpenAI Releases GPT-6 Astra",
          tags: ["openai"],
          published_at: 1_700_000_000,
          sourceCount: 4,
        },
        {
          title: "Fable 5.1 ships",
          tags: ["anthropic"],
          published_at: 1_700_000_100,
          sourceCount: 1,
        },
      ],
      1_699_000_000
    );
    expect(counts.get(trendingKey("GPT-6 Astra"))).toBe(4);
    expect(counts.get(trendingKey("Fable 5.1"))).toBe(1);
    const ranked = rankTrendingWithGrowth(
      new Map([
        ["GPT-6 Astra", 4],
        ["Fable 5.1", 1],
      ]),
      new Map()
    );
    expect(ranked[0]?.tag).toBe("GPT-6 Astra");
  });
});
