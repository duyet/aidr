import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  callSystemOne,
  isSystemOneConfigured,
  jevModelId,
  noulProb,
  scoreNorm,
  submissionRelevanceFromJev,
  suggestionVerdictFromJev,
} from "../systemone.js";
import type { Env } from "../types.js";

function envWith(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as Env["DB"],
    NEWS_INGEST: {} as Env["NEWS_INGEST"],
    ANYROUTER_BASE_URL: "https://anyrouter.dev/api/v1",
    ANYROUTER_MODEL: "anyrouter/auto",
    ANYROUTER_API_KEY: "sk-ar-test",
    NEWS_ADMIN_TOKEN: "t",
    ...overrides,
  } as Env;
}

describe("jevModelId", () => {
  it("defaults to typesafe/jev-latest", () => {
    expect(jevModelId(envWith({ ANYROUTER_JEV_MODEL: undefined }))).toBe(
      "typesafe/jev-latest"
    );
  });

  it("takes the first id of a chain", () => {
    expect(
      jevModelId(
        envWith({ ANYROUTER_JEV_MODEL: "typesafe/jev-preview,typesafe/jev-latest" })
      )
    ).toBe("typesafe/jev-preview");
  });
});

describe("isSystemOneConfigured", () => {
  it("is false without an AnyRouter key", () => {
    expect(isSystemOneConfigured(envWith({ ANYROUTER_API_KEY: "" }))).toBe(
      false
    );
  });

  it("is true with a key (TypeSafe BYOK lives dashboard-side)", () => {
    expect(isSystemOneConfigured(envWith())).toBe(true);
  });
});

describe("callSystemOne", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts state+questions to /systemone and returns answers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        model: "jev-1.13.0",
        answers: { is_ai_tech: { type: "noul", noul: 0.9 } },
        usage: { input_tokens: 100, output_tokens: 0, cost: 0 },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await callSystemOne(
      envWith(),
      { title: "New model released" },
      { is_ai_tech: { type: "noul", instructions: "AI news?" } }
    );
    expect(result?.answers.is_ai_tech?.noul).toBe(0.9);
    expect(result?.inputTokens).toBe(100);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://anyrouter.dev/api/v1/systemone");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("typesafe/jev-latest");
    expect(body.state).toEqual({ title: "New model released" });
  });

  it("returns null on non-2xx so callers fall back to chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream fail", { status: 422 }))
    );
    const result = await callSystemOne(
      envWith(),
      "state",
      { q: { type: "noul", instructions: "x" } }
    );
    expect(result).toBeNull();
  });

  it("returns null when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await callSystemOne(
      envWith({ ANYROUTER_API_KEY: "" }),
      "state",
      { q: { type: "noul", instructions: "x" } }
    );
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("answer mapping", () => {
  it("maps submission relevance from ai_tech discounted by spam", () => {
    const out = submissionRelevanceFromJev({
      is_ai_tech: { type: "noul", noul: 0.9 },
      is_spam: { type: "noul", noul: 0.1 },
    });
    expect(out?.relevance).toBeCloseTo(0.81);
    expect(out?.note).toMatch(/jev ai_tech=0\.90 spam=0\.10/);
  });

  it("returns null when either noul is missing", () => {
    expect(
      submissionRelevanceFromJev({
        is_ai_tech: { type: "noul", noul: 0.9 },
      })
    ).toBeNull();
  });

  it("normalizes score answers by criteria index", () => {
    expect(
      scoreNorm(
        { quality: { type: "score", score: "excellent" } },
        "quality",
        ["reject", "weak", "good", "excellent"]
      )
    ).toBe(1);
    expect(
      scoreNorm(
        { quality: { type: "score", score: "reject" } },
        "quality",
        ["reject", "weak", "good", "excellent"]
      )
    ).toBe(0);
  });

  it("maps suggestion verdicts with a 0.6 improvement gate", () => {
    const good = suggestionVerdictFromJev({
      is_improvement: { type: "noul", noul: 0.9 },
      quality: { type: "score", score: "good" },
    });
    expect(good?.valid).toBe(true);
    expect(good?.rating).toBeCloseTo((0.9 + 2 / 3) / 2);

    const bad = suggestionVerdictFromJev({
      is_improvement: { type: "noul", noul: 0.2 },
      quality: { type: "score", score: "reject" },
    });
    expect(bad?.valid).toBe(false);
  });

  it("noulProb clamps and rejects garbage", () => {
    expect(noulProb({ q: { type: "noul", noul: 2 } }, "q")).toBe(1);
    expect(noulProb({}, "q")).toBeNull();
  });
});
