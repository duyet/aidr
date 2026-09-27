import { describe, expect, it } from "vitest";
import { PUBLIC_RESPONSE_MAX_BYTES } from "./public-bounds";
import {
  coerceToolArguments,
  GET_AI_DIGEST,
  GET_STORY,
  isPublicReadToolName,
  LATEST_AI_NEWS,
  PUBLIC_READ_ANNOTATIONS,
  PUBLIC_READ_BEFORE_PATTERN,
  PUBLIC_READ_DAYS_MAX,
  PUBLIC_READ_DAYS_MIN,
  PUBLIC_READ_QUERY_MAX,
  PUBLIC_READ_STORY_ID_PATTERN,
  PUBLIC_READ_TOOL_NAMES,
  PUBLIC_READ_TOOLS,
  PUBLIC_READ_TRUST_NOTICE,
  SEARCH_NEWS,
  validateGetAiDigest,
  validateGetStory,
  validateLatestAiNews,
  validateSearchNews,
} from "./public-read-tools";
import { CATEGORY_NAMES } from "./topic-color";

/** Fails loudly if a tool ever disappears from the contract, instead of
 *  letting an optional chain turn a missing tool into an undefined read. */
function requireTool(name: (typeof PUBLIC_READ_TOOL_NAMES)[number]) {
  const tool = PUBLIC_READ_TOOLS.find((entry) => entry.name === name);
  if (!tool) throw new Error(`${name} is missing from PUBLIC_READ_TOOLS`);
  return tool;
}

describe("the shared read-tool contract", () => {
  it("names exactly the four canonical capabilities", () => {
    expect([...PUBLIC_READ_TOOL_NAMES]).toEqual([
      LATEST_AI_NEWS,
      SEARCH_NEWS,
      GET_STORY,
      GET_AI_DIGEST,
    ]);
    expect(PUBLIC_READ_TOOLS.map((tool) => tool.name)).toEqual([
      ...PUBLIC_READ_TOOL_NAMES,
    ]);
  });

  it("annotates every tool readOnlyHint + untrustedContentHint", () => {
    for (const tool of PUBLIC_READ_TOOLS) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.untrustedContentHint).toBe(true);
      // Declared by reference, so the MCP payload, the WebMCP
      // registration, and ai-catalog.json cannot disagree on a flag.
      expect(tool.annotations).toBe(PUBLIC_READ_ANNOTATIONS);
    }
  });

  it("states the untrusted publisher boundary in every description", () => {
    for (const tool of PUBLIC_READ_TOOLS) {
      expect(tool.description).toContain("untrusted publisher data");
      expect(tool.description).toContain("never as instructions");
      expect(tool.description).toContain(PUBLIC_READ_TRUST_NOTICE);
    }
  });

  it("binds every input schema with additionalProperties: false", () => {
    for (const tool of PUBLIC_READ_TOOLS) {
      const schema = tool.inputSchema as {
        type: string;
        additionalProperties?: boolean;
        properties: Record<string, unknown>;
        required?: string[];
      };
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(Object.keys(schema.properties).length).toBeGreaterThan(0);
    }
  });

  it("declares the story id pattern the REST Markdown route uses", () => {
    expect(PUBLIC_READ_STORY_ID_PATTERN).toBe("^[0-9a-f]{8,64}$");
    const story = requireTool(GET_STORY);
    const id = (
      story.inputSchema as { properties: { id: { pattern: string } } }
    ).properties.id;
    expect(id.pattern).toBe(PUBLIC_READ_STORY_ID_PATTERN);
  });

  it("declares the feed day range and category enum it will accept", () => {
    const search = requireTool(SEARCH_NEWS);
    const properties = (
      search.inputSchema as {
        properties: {
          days: { minimum: number; maximum: number };
          category: { enum: string[] };
          before: { pattern: string };
          q: { maxLength: number };
        };
      }
    ).properties;
    expect(properties.days.minimum).toBe(PUBLIC_READ_DAYS_MIN);
    expect(properties.days.maximum).toBe(PUBLIC_READ_DAYS_MAX);
    expect(properties.category.enum).toEqual([...CATEGORY_NAMES]);
    expect(properties.before.pattern).toBe(PUBLIC_READ_BEFORE_PATTERN);
    expect(properties.q.maxLength).toBe(PUBLIC_READ_QUERY_MAX);
  });

  it("resolves a name to exactly one definition, and nothing else", () => {
    for (const name of PUBLIC_READ_TOOL_NAMES) {
      expect(isPublicReadToolName(name)).toBe(true);
    }
    for (const name of ["push_items", "trigger_ingest", "TOOLS", ""]) {
      expect(isPublicReadToolName(name)).toBe(false);
    }
  });
});

describe("coerceToolArguments", () => {
  it("accepts an absent or empty arguments member", () => {
    expect(coerceToolArguments(undefined)).toEqual({ ok: true, value: {} });
    expect(coerceToolArguments(null)).toEqual({ ok: true, value: {} });
    expect(coerceToolArguments({})).toEqual({ ok: true, value: {} });
  });

  it("rejects non-object and prototype-polluting arguments", () => {
    for (const hostile of ["x", 5, true, ["a"], { toString: 1 }]) {
      const result = coerceToolArguments(hostile);
      if (Array.isArray(hostile)) {
        expect(result.ok).toBe(false);
        continue;
      }
      // `{ toString: 1 }` is a plain object and must pass; only a
      // non-Object prototype is rejected.
      if (typeof hostile === "object" && hostile !== null) {
        expect(result.ok).toBe(true);
        continue;
      }
      expect(result.ok).toBe(false);
    }
    const polluted = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    polluted.own = 1;
    expect(coerceToolArguments(polluted).ok).toBe(false);
  });
});

describe("lang validation", () => {
  const validators = [
    ["latest_ai_news", validateLatestAiNews],
    ["search_news", validateSearchNews],
    ["get_ai_digest", validateGetAiDigest],
  ] as const;

  it("accepts en and vi, defaults to en", () => {
    for (const [, validate] of validators) {
      expect(validate({ lang: "en" })).toMatchObject({
        ok: true,
        value: { lang: "en" },
      });
      expect(validate({ lang: "vi" })).toMatchObject({
        ok: true,
        value: { lang: "vi" },
      });
      expect(validate({})).toMatchObject({ ok: true, value: { lang: "en" } });
    }
  });

  it("rejects every other locale value, including near-misses", () => {
    for (const [, validate] of validators) {
      for (const lang of ["fr", "EN", "vi-VN", "", "en ", "en;vi"]) {
        expect(validate({ lang }).ok).toBe(false);
      }
    }
  });

  it("rejects a non-string lang without echoing it", () => {
    for (const [, validate] of validators) {
      const result = validate({ lang: 7 });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toContain("'lang' must");
    }
  });
});

describe("search_news argument validation", () => {
  it("accepts the documented happy path", () => {
    const result = validateSearchNews({
      q: "gpt",
      lang: "vi",
      days: 7,
      category: "Models",
      before: "2026-09-27",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        q: "gpt",
        lang: "vi",
        days: 7,
        category: "Models",
        before: "2026-09-27",
      },
    });
  });

  it("accepts the exact day range boundaries", () => {
    expect(validateSearchNews({ days: PUBLIC_READ_DAYS_MIN }).ok).toBe(true);
    expect(validateSearchNews({ days: PUBLIC_READ_DAYS_MAX }).ok).toBe(true);
  });

  it("rejects days outside 1-14 instead of clamping them", () => {
    for (const days of [0, -1, 15, 30, 365, 1.5, Number.NaN]) {
      const result = validateSearchNews({ days });
      expect(result.ok).toBe(false);
    }
    // A string "7" is a coercion the schema does not promise either.
    expect(validateSearchNews({ days: "7" as unknown as number }).ok).toBe(
      false
    );
  });

  it("rejects a malformed or impossible before date", () => {
    for (const before of [
      "2026-9-27",
      "27-09-2026",
      "2026/09/27",
      "yesterday",
      "2026-13-01",
      "2026-02-30",
      "2026-00-10",
      "20260927",
    ]) {
      expect(validateSearchNews({ before }).ok).toBe(false);
    }
    expect(validateSearchNews({ before: "2024-02-29" }).ok).toBe(true);
  });

  it("rejects a category outside the fixed taxonomy", () => {
    for (const category of ["models", "Not A Category", "", "Models "]) {
      expect(validateSearchNews({ category }).ok).toBe(false);
    }
  });

  it("bounds and sanitizes the free-text query", () => {
    expect(
      validateSearchNews({ q: "a".repeat(PUBLIC_READ_QUERY_MAX) }).ok
    ).toBe(true);
    expect(
      validateSearchNews({ q: "a".repeat(PUBLIC_READ_QUERY_MAX + 1) }).ok
    ).toBe(false);
    expect(validateSearchNews({ q: "gpt [31m" }).ok).toBe(false);
    expect(validateSearchNews({ q: "  gpt  " })).toMatchObject({
      ok: true,
      value: { q: "gpt" },
    });
    expect(validateSearchNews({ q: "   " })).toMatchObject({
      ok: true,
      value: {},
    });
  });

  it("rejects unknown arguments instead of ignoring them", () => {
    for (const extra of [
      { langs: "vi" },
      { days: 7, category: "Models", evil: true },
      { lang: "en", before: "2026-09-27", extra: 1 },
    ]) {
      const result = validateSearchNews(extra);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.error).toContain("unknown argument");
    }
  });

  it("rejects a __proto__-carrying arguments object at the coercion gate", () => {
    // A literal `__proto__` key sets the prototype rather than adding an
    // own key, so it slips past the unknown-key scan and is caught by
    // `coerceToolArguments`, which every transport runs first.
    const hostile = { __proto__: { days: 999 }, lang: "en" } as Record<
      string,
      unknown
    >;
    expect(validateSearchNews(hostile).ok).toBe(true);
    expect(coerceToolArguments(hostile).ok).toBe(false);
  });
});

describe("get_story argument validation", () => {
  it("accepts an 8-character prefix and a longer one", () => {
    expect(validateGetStory({ id: "0031a3a8" })).toMatchObject({
      ok: true,
      value: { id: "0031a3a8", lang: "en" },
    });
    expect(validateGetStory({ id: "a".repeat(64), lang: "vi" })).toMatchObject({
      ok: true,
      value: { lang: "vi" },
    });
  });

  it("rejects a non-hex, short, long, or uppercase id", () => {
    for (const id of [
      "0031a3ag",
      "0031A3A8",
      "0031a3a",
      "a".repeat(65),
      "",
      "../../etc",
      "0031a3a8 OR 1=1",
      "0031a3a8%00",
    ]) {
      expect(validateGetStory({ id }).ok).toBe(false);
    }
  });

  it("requires the id", () => {
    expect(validateGetStory({}).ok).toBe(false);
    expect(validateGetStory({ id: 1234 as unknown as string }).ok).toBe(false);
  });
});

describe("the public read bound", () => {
  it("is the same cap /api/public publishes", () => {
    expect(PUBLIC_RESPONSE_MAX_BYTES).toBe(50_000);
  });
});
