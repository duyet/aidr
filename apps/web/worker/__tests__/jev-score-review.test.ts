import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  jevPanelModelFamily,
  resolveJevPanelWorkflowConfig,
} from "../jev-panel/config.js";
import { JEV_PANEL_MAX_PROMPT_BYTES } from "../jev-panel/executor.js";
import {
  type JevScoreItem,
  jevPanelRelevance,
  resetJevScoreReviewMemo,
  reviewScoredItemsWithJevPanel,
} from "../jev-panel/score-review.js";
import { scoreItems, withLlmCallContext } from "../llm.js";
import type { Env } from "../types.js";

const CATEGORIES = ["Models", "Regulation", "Industry"] as const;

const baseEnv: Env = {
  DB: {} as D1Database,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
  ANYROUTER_MODEL: "test-model",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
};

function panelEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...baseEnv,
    JEV_PANEL_ENABLED: "1",
    JEV_PANEL_RELEVANCE_MODEL: "openai/gpt-5.2",
    JEV_PANEL_SOURCE_QUALITY_MODEL: "anthropic/claude-opus-4-5",
    ...overrides,
  };
}

const item: JevScoreItem = {
  id: "item-1",
  title: "Anthropic ships a new model",
  summary: "The company said the model beats prior baselines.",
  source: "vendor",
};

function judgment(overrides: Record<string, unknown> = {}): unknown {
  return {
    vote: "support",
    confidence: 0.8,
    score: 0.9,
    category: "Models",
    claims: [
      {
        id: "c1",
        text: "Anthropic shipped a new model.",
        evidence: [{ sourceId: "vendor", locator: "https://example.test/a" }],
      },
    ],
    rationale: "named publisher",
    ...overrides,
  };
}

/** A chat-completions SSE body carrying one JSON answer from `model`. */
function judgeResponse(body: string): Response {
  const frame = (delta: unknown) =>
    `data: ${JSON.stringify({
      id: "req_test",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta }],
    })}\n\n`;
  const stream =
    frame({ content: "", role: "assistant" }) +
    frame({ content: body }) +
    `data: ${JSON.stringify({ id: "req_test", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\n` +
    "data: [DONE]\n\n";
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Routes each judge by the model the panel asked for, so a fallback that
 *  lands on a different model is observable. */
function judgeFetchMock(answer: () => string): ReturnType<typeof vi.fn> {
  return vi.fn(async () => judgeResponse(answer()));
}

/** A panel whose two judges split on the first round and converge on the
 *  replacement round, so the debate path is exercised end to end. */
function disagreeingPanelFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn(async (_url: unknown, init: unknown) => {
    const body = JSON.parse((init as { body: string }).body) as {
      model: string;
      messages: { content: string }[];
    };
    const replacement = body.messages[0].content.includes("initialAggregate");
    if (replacement) {
      return judgeResponse(JSON.stringify(judgment({ score: 0.7 })));
    }
    const vote = body.model.startsWith("anthropic/") ? "oppose" : "support";
    return judgeResponse(JSON.stringify(judgment({ vote, score: 0.1 })));
  });
}

beforeEach(() => {
  resetJevScoreReviewMemo();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetJevScoreReviewMemo();
});

describe("resolveJevPanelWorkflowConfig", () => {
  it("is off unless JEV_PANEL_ENABLED is explicitly truthy", () => {
    expect(resolveJevPanelWorkflowConfig(baseEnv).enabled).toBe(false);
    expect(
      resolveJevPanelWorkflowConfig({ ...baseEnv, JEV_PANEL_ENABLED: "0" })
        .enabled
    ).toBe(false);
    expect(
      resolveJevPanelWorkflowConfig({ ...baseEnv, JEV_PANEL_ENABLED: "" })
        .enabled
    ).toBe(false);
    expect(
      resolveJevPanelWorkflowConfig({ ...baseEnv, JEV_PANEL_ENABLED: "maybe" })
        .enabled
    ).toBe(false);
    expect(resolveJevPanelWorkflowConfig(panelEnv()).panel).not.toBeNull();
  });

  // A second slot pointed at the same model would turn one opinion into two
  // votes. Refusing the config is the only honest way to prevent that.
  it("refuses two roles that name the same model", () => {
    const resolved = resolveJevPanelWorkflowConfig(
      panelEnv({ JEV_PANEL_SOURCE_QUALITY_MODEL: "openai/gpt-5.2" })
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.panel).toBeNull();
    expect(resolved.reason).toMatch(/same model id/);
  });

  it("refuses two roles from the same vendor family", () => {
    const resolved = resolveJevPanelWorkflowConfig(
      panelEnv({ JEV_PANEL_SOURCE_QUALITY_MODEL: "openai/gpt-5.2-mini" })
    );
    expect(resolved.panel).toBeNull();
    expect(resolved.reason).toMatch(/same model family/);
  });

  it("refuses a router alias, which is not a model", () => {
    const resolved = resolveJevPanelWorkflowConfig(
      panelEnv({ JEV_PANEL_RELEVANCE_MODEL: "anyrouter/auto" })
    );
    expect(resolved.panel).toBeNull();
    expect(resolved.reason).toMatch(/concrete model id/);
  });

  it("refuses a half-configured panel", () => {
    const resolved = resolveJevPanelWorkflowConfig(
      panelEnv({ JEV_PANEL_SOURCE_QUALITY_MODEL: "" })
    );
    expect(resolved.panel).toBeNull();
    expect(resolved.reason).toMatch(/SOURCE_QUALITY_MODEL is not configured/);
  });

  it("keeps a usable panel's quorum inside the judge's count", () => {
    const two = resolveJevPanelWorkflowConfig(
      panelEnv({ JEV_PANEL_QUORUM: "9" })
    ).panel;
    expect(two?.quorum).toBe(2);
    const one = resolveJevPanelWorkflowConfig(
      panelEnv({ JEV_PANEL_QUORUM: "1" })
    ).panel;
    expect(one?.quorum).toBe(2);
  });

  it("only ever enables the core's single debate round", () => {
    expect(
      resolveJevPanelWorkflowConfig(panelEnv({ JEV_PANEL_DEBATE: "1" })).panel
        ?.debate?.maxRounds
    ).toBe(1);
    expect(
      resolveJevPanelWorkflowConfig(panelEnv({ JEV_PANEL_DEBATE: "7" })).panel
        ?.debate?.maxRounds
    ).toBe(0);
    expect(
      resolveJevPanelWorkflowConfig(panelEnv()).panel?.debate?.maxRounds
    ).toBe(0);
  });

  it("derives a family from the vendor segment only", () => {
    expect(jevPanelModelFamily("OpenAI/GPT-5.2")).toBe("openai");
    expect(jevPanelModelFamily("claude-opus-4-5")).toBe("claude-opus-4-5");
  });
});

describe("reviewScoredItemsWithJevPanel default-off path", () => {
  it("issues no judge call and returns no outcomes when disabled", async () => {
    const fetchMock = judgeFetchMock(() => JSON.stringify(judgment()));
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(
      { ...panelEnv(), JEV_PANEL_ENABLED: "" },
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    expect(summary.configEnabled).toBe(false);
    expect(summary.outcomes.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a misconfigured panel without calling a judge", async () => {
    const fetchMock = judgeFetchMock(() => JSON.stringify(judgment()));
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({ JEV_PANEL_SOURCE_QUALITY_MODEL: "openai/gpt-5.2" }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    expect(summary.outcomes.get(item.id)?.kind).toBe("misconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A typo in the panel config must never reject a whole ingest run, so a
  // misconfiguration degrades open regardless of the configured fail mode.
  it("degrades a misconfiguration open even when fail mode is closed", async () => {
    vi.stubGlobal(
      "fetch",
      judgeFetchMock(() => JSON.stringify(judgment()))
    );

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({
        JEV_PANEL_SOURCE_QUALITY_MODEL: "openai/gpt-5.2",
        JEV_PANEL_FAIL_MODE: "closed",
      }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.kind).toBe("misconfigured");
    expect(outcome?.relevanceAfter).toBe(0.9);
    expect(jevPanelRelevance(0.9, outcome)).toBe(0.9);
  });
});

describe("reviewScoredItemsWithJevPanel quorum", () => {
  it("keeps the primary score when only one of two judges returns a vote", async () => {
    // The source_quality judge 500s, so quorum of 2 is never reached and the
    // core must report human_review rather than promote a single opinion.
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
      };
      if (body.model.startsWith("anthropic/")) {
        return new Response("upstream boom", { status: 500 });
      }
      return judgeResponse(JSON.stringify(judgment({ score: 0.1 })));
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.quorumReached).toBe(false);
    expect(outcome?.recommendation).toBe("human_review");
    expect(outcome?.kind).toBe("degraded_open");
    expect(jevPanelRelevance(0.9, outcome)).toBe(0.9);
  });

  it("lowers relevance to the panel ceiling once quorum is reached", async () => {
    const fetchMock = judgeFetchMock(() =>
      JSON.stringify(judgment({ score: 0.2 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.recommendation).toBe("support");
    expect(outcome?.quorumReached).toBe(true);
    expect(outcome?.kind).toBe("demoted");
    expect(jevPanelRelevance(0.9, outcome)).toBe(0.2);
  });

  it("never raises relevance, even when the panel scores higher", async () => {
    vi.stubGlobal(
      "fetch",
      judgeFetchMock(() => JSON.stringify(judgment({ score: 1 })))
    );

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.4]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.kind).toBe("unchanged");
    expect(jevPanelRelevance(0.4, outcome)).toBe(0.4);
  });

  it("forces relevance to 0 when the panel votes against publication", async () => {
    vi.stubGlobal(
      "fetch",
      judgeFetchMock(() =>
        JSON.stringify(judgment({ vote: "oppose", score: 0.9 }))
      )
    );

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.recommendation).toBe("oppose");
    expect(outcome?.kind).toBe("opposed");
    expect(jevPanelRelevance(0.9, outcome)).toBe(0);
  });

  // An abstain from one judge leaves one directional vote, which cannot reach
  // a quorum of 2, so the panel must abstain from deciding.
  it("does not decide when a judge abstains", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
      };
      if (body.model.startsWith("anthropic/")) {
        return judgeResponse(
          JSON.stringify({
            vote: "abstain",
            confidence: 0.2,
            score: null,
            category: null,
            claims: [],
          })
        );
      }
      return judgeResponse(JSON.stringify(judgment({ score: 0.05 })));
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.recommendation).toBe("human_review");
    expect(jevPanelRelevance(0.9, outcome)).toBe(0.9);
  });

  // A chain that falls through to a different model must not produce a vote.
  // Reporting the configured id instead of the one that served would turn a
  // transport fallback into a second opinion from the same model.
  it("drops a vote whose served model differs from the configured judge", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
      };
      // The primary is unavailable, so the chain advances to a model nobody
      // configured for this slot.
      if (body.model === "openai/gpt-5.2") {
        return new Response("overloaded", { status: 503 });
      }
      return judgeResponse(JSON.stringify(judgment({ score: 0.01 })));
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({
        JEV_PANEL_RELEVANCE_MODEL: "openai/gpt-5.2,openai/gpt-4o",
      }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.quorumReached).toBe(false);
    expect(outcome?.recommendation).toBe("human_review");
    expect(jevPanelRelevance(0.9, outcome)).toBe(0.9);
  });
});

describe("reviewScoredItemsWithJevPanel debate cap", () => {
  it("runs at most the single replacement cross-examination round", async () => {
    const fetchMock = disagreeingPanelFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({ JEV_PANEL_DEBATE: "1" }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    // Two judges x (initial + one replacement round) = 4 calls, never more.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // The replacement judgments supersede the initial ones; the round two mean
    // of 0.7 becomes the ceiling over the 0.9 primary.
    expect(summary.outcomes.get(item.id)?.kind).toBe("demoted");
    expect(jevPanelRelevance(0.9, summary.outcomes.get(item.id))).toBe(0.7);
  });

  it("does not debate at all when the switch is off", async () => {
    const fetchMock = disagreeingPanelFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A tie with no replacement round stays unresolved and changes nothing.
    expect(summary.outcomes.get(item.id)?.recommendation).toBe("human_review");
  });

  it("leaves an unresolved debate on the primary score when the round ties again", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
        messages: { content: string }[];
      };
      // Disagree again in round two, so the replacement round resolves nothing.
      const vote = body.model.startsWith("anthropic/") ? "oppose" : "support";
      return judgeResponse(
        JSON.stringify(judgment({ vote, score: 0.1, category: "Models" }))
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({ JEV_PANEL_DEBATE: "1" }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(summary.outcomes.get(item.id)?.kind).toBe("degraded_open");
    expect(jevPanelRelevance(0.9, summary.outcomes.get(item.id))).toBe(0.9);
  });

  it("keeps a pathological subject inside the prompt byte cap", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      const second = body.messages[0].content.includes("initialAggregate");
      return judgeResponse(
        JSON.stringify(judgment({ score: second ? 0.7 : 0.1 }))
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await reviewScoredItemsWithJevPanel(panelEnv({ JEV_PANEL_DEBATE: "1" }), {
      items: [{ ...item, summary: "x".repeat(100_000) }],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });

    // The subject is fenced and length-capped before it reaches a prompt, so
    // the request count stays at the debate-capped maximum.
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse((call[1] as { body: string }).body) as {
        messages: { content: string }[];
      };
      expect(
        new TextEncoder().encode(body.messages[0].content).length
      ).toBeLessThanOrEqual(JEV_PANEL_MAX_PROMPT_BYTES);
    }
  });

  it("stops making judge calls once the item budget is exhausted", async () => {
    // A zero budget means the deadline has already passed, so the adapter
    // reports a timeout instead of starting an unbounded chain.
    const fetchMock = judgeFetchMock(() => JSON.stringify(judgment()));
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({ JEV_PANEL_BUDGET_MS: "1" }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );

    expect(summary.outcomes.get(item.id)?.recommendation).toBe("human_review");
    expect(jevPanelRelevance(0.9, summary.outcomes.get(item.id))).toBe(0.9);
  });
});

describe("reviewScoredItemsWithJevPanel idempotent replay", () => {
  it("reuses the memoized panel result for a replayed run/decision", async () => {
    const fetchMock = judgeFetchMock(() =>
      JSON.stringify(judgment({ score: 0.15 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await withLlmCallContext("run-1", () =>
      reviewScoredItemsWithJevPanel(panelEnv(), {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      })
    );
    const firstCalls = fetchMock.mock.calls.length;
    const firstKey = first.outcomes.get(item.id)?.idempotencyKey;

    const second = await withLlmCallContext("run-1", () =>
      reviewScoredItemsWithJevPanel(panelEnv(), {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      })
    );

    expect(firstCalls).toBe(2);
    // A replay must not spend judge calls again.
    expect(fetchMock.mock.calls.length).toBe(firstCalls);
    expect(second.outcomes.get(item.id)?.kind).toBe("replayed");
    expect(second.outcomes.get(item.id)?.idempotencyKey).toBe(firstKey);
    // And it must not double-count: the same ceiling comes back.
    expect(jevPanelRelevance(0.9, second.outcomes.get(item.id))).toBe(0.15);
  });

  it("is monotonic, so applying the ceiling twice cannot lower twice", () => {
    const outcome = {
      kind: "demoted" as const,
      reason: "x",
      recommendation: "support" as const,
      quorumReached: true,
      idempotencyKey: null,
      relevanceBefore: 0.9,
      relevanceAfter: 0.2,
      category: null,
      categoryApplied: false,
    };
    expect(jevPanelRelevance(0.9, outcome)).toBe(0.2);
    expect(jevPanelRelevance(jevPanelRelevance(0.9, outcome), outcome)).toBe(
      0.2
    );
  });

  it("does not reuse a result across a different run or a changed subject", async () => {
    const fetchMock = judgeFetchMock(() =>
      JSON.stringify(judgment({ score: 0.3 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    };
    await withLlmCallContext("run-1", () =>
      reviewScoredItemsWithJevPanel(panelEnv(), request)
    );
    const afterFirst = fetchMock.mock.calls.length;

    const otherRun = await withLlmCallContext("run-2", () =>
      reviewScoredItemsWithJevPanel(panelEnv(), request)
    );
    expect(fetchMock.mock.calls.length).toBe(afterFirst * 2);
    expect(otherRun.outcomes.get(item.id)?.kind).toBe("demoted");

    const changed = await withLlmCallContext("run-1", () =>
      reviewScoredItemsWithJevPanel(panelEnv(), {
        ...request,
        items: [{ ...item, title: "A different headline" }],
      })
    );
    // run-1 + run-2 + run-1-with-changed-subject: three fresh panels, six calls.
    expect(fetchMock.mock.calls.length).toBe(afterFirst * 3);
    expect(changed.outcomes.get(item.id)?.kind).toBe("demoted");
  });
});

describe("reviewScoredItemsWithJevPanel degradation", () => {
  it("keeps the primary score when both judges time out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timed out")));

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.8]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.kind).toBe("degraded_open");
    expect(outcome?.reason).toMatch(/quorum_not_reached/);
    expect(jevPanelRelevance(0.8, outcome)).toBe(0.8);
  });

  it("keeps the primary score when every judge returns unparseable output", async () => {
    vi.stubGlobal(
      "fetch",
      judgeFetchMock(() => "not json at all")
    );

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.8]]),
      categoryOptions: CATEGORIES,
    });

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.recommendation).toBe("human_review");
    expect(jevPanelRelevance(0.8, outcome)).toBe(0.8);
  });

  it("forces relevance to 0 on an unresolved panel when fail mode is closed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timed out")));

    const summary = await reviewScoredItemsWithJevPanel(
      panelEnv({ JEV_PANEL_FAIL_MODE: "closed" }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.8]]),
        categoryOptions: CATEGORIES,
      }
    );

    const outcome = summary.outcomes.get(item.id);
    expect(outcome?.kind).toBe("degraded_closed");
    expect(jevPanelRelevance(0.8, outcome)).toBe(0);
  });

  it("keeps the primary category unless category adoption is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      judgeFetchMock(() => JSON.stringify(judgment({ category: "Industry" })))
    );

    const off = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map([[item.id, 0.9]]),
      categoryOptions: CATEGORIES,
    });
    expect(off.outcomes.get(item.id)?.category).toBeNull();

    resetJevScoreReviewMemo();
    const on = await reviewScoredItemsWithJevPanel(
      panelEnv({ JEV_PANEL_APPLY_CATEGORY: "1" }),
      {
        items: [item],
        relevanceById: new Map([[item.id, 0.9]]),
        categoryOptions: CATEGORIES,
      }
    );
    expect(on.outcomes.get(item.id)?.category).toBe("Industry");
    expect(on.outcomes.get(item.id)?.categoryApplied).toBe(true);
  });

  it("skips items the primary pass never scored", async () => {
    const fetchMock = judgeFetchMock(() => JSON.stringify(judgment()));
    vi.stubGlobal("fetch", fetchMock);

    const summary = await reviewScoredItemsWithJevPanel(panelEnv(), {
      items: [item],
      relevanceById: new Map(),
      categoryOptions: CATEGORIES,
    });

    expect(summary.outcomes.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("scoreItems call site", () => {
  const scoreInput = [
    { i: 0, id: "story-1", title: "Anthropic ships a model", source: "vendor" },
  ];
  const primaryScore = JSON.stringify({
    results: [
      {
        i: 0,
        relevance: 0.9,
        importance: 7,
        quality: 8,
        category: "Models",
        tags: ["anthropic"],
      },
    ],
  });
  const PANEL_MODELS = ["openai/gpt-5.2", "anthropic/claude-opus-4-5"];

  /** Answers the primary scoring batch one way and every judge another. The
   *  System One gate is left to fail so the chat backup answers the primary,
   *  which keeps panel traffic countable by the model that was asked for. */
  function scoringFetchMock(options: {
    panelJudgment: () => string;
    panelFails?: boolean;
  }): ReturnType<typeof vi.fn> {
    return vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
      };
      if (body.model === "anyrouter/primary") {
        return judgeResponse(primaryScore);
      }
      if (options.panelFails)
        return new Response("overloaded", { status: 503 });
      return judgeResponse(options.panelJudgment());
    });
  }

  function panelEnv(overrides: Partial<Env> = {}): Env {
    return {
      ...baseEnv,
      ANYROUTER_MODEL: "anyrouter/primary",
      JEV_PANEL_ENABLED: "1",
      JEV_PANEL_RELEVANCE_MODEL: PANEL_MODELS[0],
      JEV_PANEL_SOURCE_QUALITY_MODEL: PANEL_MODELS[1],
      ...overrides,
    };
  }

  /** Models the panel asked for, which is exactly the vote count. */
  function panelCalls(mock: ReturnType<typeof vi.fn>): string[] {
    return mock.mock.calls
      .map((call) => JSON.parse((call[1] as { body: string }).body).model)
      .filter((model: string) => PANEL_MODELS.includes(model));
  }

  // The default path must be indistinguishable from the pre-panel behavior:
  // the same primary calls, the same row, and no extra field on the result.
  it("leaves scoring untouched when the panel is not enabled", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment({ score: 0 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await scoreItems(
      panelEnv({ JEV_PANEL_ENABLED: "" }),
      scoreInput
    );

    expect(panelCalls(fetchMock)).toEqual([]);
    expect(rows).toEqual([
      {
        i: 0,
        relevance: 0.9,
        importance: 7,
        quality: 8,
        category: "Models",
        tags: ["anthropic"],
        tokens: 30,
      },
    ]);
    expect(rows[0].jevReview).toBeUndefined();
  });

  it("never reaches the panel when the switch is off but models are set", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment({ score: 0 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await scoreItems(
      panelEnv({ JEV_PANEL_ENABLED: "0" }),
      scoreInput
    );

    expect(panelCalls(fetchMock)).toEqual([]);
    expect(rows[0].relevance).toBe(0.9);
  });

  it("lowers the primary relevance to the panel ceiling and records why", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment({ score: 0.25 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await withLlmCallContext("run-1", () =>
      scoreItems(panelEnv(), scoreInput)
    );

    expect(panelCalls(fetchMock)).toEqual(PANEL_MODELS);
    expect(rows[0].relevance).toBe(0.25);
    expect(rows[0].jevReview?.kind).toBe("demoted");
    expect(rows[0].jevReview?.quorumReached).toBe(true);
    expect(rows[0].jevReview?.reason).toMatch(/panel relevance ceiling 0.25/);
    // The primary row's other fields survive the second opinion untouched.
    expect(rows[0].importance).toBe(7);
    expect(rows[0].quality).toBe(8);
    expect(rows[0].category).toBe("Models");
    expect(rows[0].tags).toEqual(["anthropic"]);
  });

  it("keeps the primary relevance when the panel cannot be reached", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment()),
      panelFails: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await withLlmCallContext("run-2", () =>
      scoreItems(panelEnv(), scoreInput)
    );

    expect(rows[0].relevance).toBe(0.9);
    expect(rows[0].jevReview?.kind).toBe("degraded_open");
    expect(rows[0].importance).toBe(7);
    expect(rows[0].quality).toBe(8);
  });

  it("keeps the primary relevance when the panel config is unusable", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment({ score: 0 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await withLlmCallContext("run-2b", () =>
      scoreItems(
        panelEnv({ JEV_PANEL_SOURCE_QUALITY_MODEL: "openai/gpt-4o" }),
        scoreInput
      )
    );

    expect(panelCalls(fetchMock)).toEqual([]);
    expect(rows[0].relevance).toBe(0.9);
    expect(rows[0].jevReview?.kind).toBe("misconfigured");
  });

  it("skips the panel for rows with no decision identity", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment({ score: 0 })),
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await scoreItems(panelEnv(), [
      { i: 0, title: "No id", source: "vendor" },
    ]);

    expect(panelCalls(fetchMock)).toEqual([]);
    expect(rows[0].relevance).toBe(0.9);
    expect(rows[0].jevReview).toBeUndefined();
  });

  it("does not re-run the panel for a replayed step in the same run", async () => {
    const fetchMock = scoringFetchMock({
      panelJudgment: () => JSON.stringify(judgment({ score: 0.4 })),
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = panelEnv();

    const first = await withLlmCallContext("run-3", () =>
      scoreItems(env, scoreInput)
    );
    const second = await withLlmCallContext("run-3", () =>
      scoreItems(env, scoreInput)
    );

    // The primary batch is re-scored on a replay; the panel is not.
    expect(panelCalls(fetchMock)).toEqual(PANEL_MODELS);
    expect(first[0].relevance).toBe(0.4);
    expect(second[0].relevance).toBe(0.4);
    expect(second[0].jevReview?.kind).toBe("replayed");
    expect(second[0].jevReview?.idempotencyKey).toBe(
      first[0].jevReview?.idempotencyKey
    );
  });
});
