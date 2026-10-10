import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLM_STEP } from "../ingest/context.js";
import type { LlmCallLogEntry } from "../llm.js";
import {
  buildRoute,
  callAnyrouter,
  _extractLastJsonObjectForTests as extractLastJsonObject,
  generateTldr,
  logLlmCall,
  modelAttemptTimeoutMs,
  normalizeTag,
  _normalizeTldrForTests as normalizeTldr,
  _parseJsonForTests as parseJson,
  _parseTranslateRowsForTests as parseTranslateRows,
  RULES_OVERVIEW,
  raceTimeout,
  resetUnavailableModels,
  SCORE_CHAT_TIMEOUT_MS,
  SCORE_DECISION_TIMEOUT_MS,
  SCORE_JEV_TIMEOUT_MS,
  SCORE_SLICE_MAX_MS,
  sanitizeScoreResults,
  sanitizeTranslateResults,
  scoreBatchPrompt,
  scoreItems,
  setLlmCallLogger,
  TLDR_RETRY_RESERVE_MS,
  TLDR_SLICE_MAX_MS,
  TLDR_TIMEOUT_MS,
  TRANSLATE_FIRST_TOKEN_MS,
  tldrAttemptTimeoutMs,
  translateItems,
  VI_STYLE,
} from "../llm.js";
import { servedByJev } from "../systemone.js";
import { sanitizeError } from "../telemetry-safe.js";
import type { Env } from "../types.js";

const env: Env = {
  DB: {} as D1Database,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.dev/api/v1",
  ANYROUTER_MODEL: "test-model",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
};

// The 404 circuit breaker is isolate-wide; one test's 404 must not skip
// an id in the next.
beforeEach(() => resetUnavailableModels());

describe("LLM observability redaction", () => {
  it("suppresses sensitive reviewer snippets and provider response bodies", () => {
    const entries: LlmCallLogEntry[] = [];
    const logger = (entry: LlmCallLogEntry) => {
      entries.push(entry);
    };
    setLlmCallLogger(logger);
    logLlmCall({
      ts: 1,
      task: "review",
      model: "reviewer/model",
      ok: false,
      tokens: 0,
      promptTokens: null,
      completionTokens: null,
      cachedTokens: null,
      durationMs: 1,
      error: "anyrouter request failed: 500 SECRET_RESPONSE_BODY",
      promptChars: 10,
      responseSnippet: "SECRET_RESPONSE_BODY",
    });
    setLlmCallLogger(null);
    expect(entries[0]?.responseSnippet).toBeNull();
    expect(entries[0]?.error).toBe("anyrouter request failed: 500");
  });

  it("suppresses response bodies for every task", () => {
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    logLlmCall({
      ts: 3,
      task: "other",
      model: "cluster/model",
      ok: true,
      tokens: 1,
      promptTokens: 1,
      completionTokens: 0,
      cachedTokens: 0,
      durationMs: 1,
      error: null,
      promptChars: 10,
      responseSnippet: "private provider output",
    });
    setLlmCallLogger(null);
    expect(entries[0]?.responseSnippet).toBeNull();
  });

  it("suppresses translation response bodies as well", () => {
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    logLlmCall({
      ts: 2,
      task: "translate",
      model: "generator/model",
      ok: true,
      tokens: 2,
      promptTokens: 1,
      completionTokens: 1,
      cachedTokens: 0,
      durationMs: 1,
      error: null,
      promptChars: 20,
      responseSnippet: "private translated article text",
    });
    setLlmCallLogger(null);
    expect(entries[0]?.responseSnippet).toBeNull();
  });
});

describe("scoreBatchPrompt", () => {
  it("tells the model to prefer source-backed quality over thin duplicates", () => {
    const prompt = scoreBatchPrompt([
      { i: 0, title: "Claude 4 ships", source: "theverge.com" },
    ]);
    expect(prompt).toContain("source-backed");
    expect(prompt).toContain("thin duplicate");
    expect(prompt).toContain("theverge.com");
    expect(prompt).toContain("Quality rubric");
  });
});

describe("parseJson", () => {
  it("parses plain JSON", () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  // Shapes Laguna S 2.1 streamed in the 2026-10-01 probe. Without repair the
  // translate batch is dropped, and the TL;DR loses bullets_vi entirely.
  it("drops a stray trailing closer", () => {
    expect(parseJson('{"results":[{"i":0,"title":"x"}]}]')).toEqual({
      results: [{ i: 0, title: "x" }],
    });
  });

  it("keeps bullets_vi when the root is closed too early", () => {
    const raw =
      '{"bullets_en":[{"text":"a","item_ids":["1"]}]},"bullets_vi":[{"text":"b","item_ids":["1"]}]}';
    expect(parseJson(raw)).toEqual({
      bullets_en: [{ text: "a", item_ids: ["1"] }],
      bullets_vi: [{ text: "b", item_ids: ["1"] }],
    });
  });

  it("leaves brackets inside strings alone and still rejects truncation", () => {
    expect(parseJson('{"t":"a]}\\"b"}]')).toEqual({ t: 'a]}"b' });
    expect(() => parseJson('{"results":[{"i":0,"title":"cut')).toThrow();
  });

  it("strips markdown fences", () => {
    expect(parseJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips fences without language tag", () => {
    expect(parseJson<{ a: number }>('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts a JSON object wrapped in prose, with no fence", () => {
    expect(
      parseJson<{ a: number }>(
        'Sure, here is the result: {"a":1} Hope that helps!'
      )
    ).toEqual({ a: 1 });
  });

  it("extracts a JSON array wrapped in prose", () => {
    expect(parseJson<number[]>("The list is [1,2,3] as requested.")).toEqual([
      1, 2, 3,
    ]);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseJson("not json")).toThrow();
  });

  it("throws when there's no JSON-shaped content at all", () => {
    expect(() => parseJson("no braces or brackets here")).toThrow();
  });
});

/** Anyrouter only answers large prompts inline when the request sets
 * `stream: true`, so every mocked response is an SSE body. */
function sseBody(events: unknown[]): string {
  return `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
}

function sseResponse(events: unknown[]): Response {
  return new Response(sseBody(events), { status: 200 });
}

function chatResponse(content: string): Response {
  return sseResponse([{ choices: [{ delta: { content } }] }]);
}

function reasoningResponse(reasoning: string, content = ""): Response {
  return sseResponse([{ choices: [{ delta: { content, reasoning } }] }]);
}

function chatResponseWithUsage(content: string, totalTokens: number): Response {
  return sseResponse([
    { choices: [{ delta: { content } }] },
    { usage: { totalTokens } },
  ]);
}

describe("extractLastJsonObject", () => {
  it("returns null when there's no closing brace", () => {
    expect(extractLastJsonObject("no json here")).toBeNull();
  });

  it("extracts a single top-level object", () => {
    expect(extractLastJsonObject('some reasoning... {"a":1}')).toBe('{"a":1}');
  });

  it("extracts the LAST of multiple objects, respecting nested braces", () => {
    const text =
      'Let me think: {"draft":1} actually wait, final answer: {"a":{"nested":1},"b":2}';
    expect(extractLastJsonObject(text)).toBe('{"a":{"nested":1},"b":2}');
  });
});

describe("normalizeTldr", () => {
  it("accepts the documented bullets_en/bullets_vi shape", () => {
    const result = normalizeTldr({
      bullets_en: [{ text: "A", item_ids: ["1"] }],
      bullets_vi: [{ text: "B", item_ids: ["2"] }],
    });
    expect(result).toEqual({
      bullets_en: [{ text: "A", item_ids: ["1"] }],
      bullets_vi: [{ text: "B", item_ids: ["2"] }],
    });
  });

  it("accepts the alternate {bullets: {en, vi}} shape", () => {
    const result = normalizeTldr({
      bullets: {
        en: [{ text: "A", item_ids: ["1"] }],
        vi: [{ text: "B", item_ids: ["2"] }],
      },
    });
    expect(result).toEqual({
      bullets_en: [{ text: "A", item_ids: ["1"] }],
      bullets_vi: [{ text: "B", item_ids: ["2"] }],
    });
  });

  it("tolerates bullets missing item_id and plain-string bullets", () => {
    const result = normalizeTldr({
      bullets_en: [{ text: "No id here" }, "Just a string bullet"],
      bullets_vi: [],
    });
    expect(result.bullets_en).toEqual([
      { text: "No id here", item_ids: [] },
      { text: "Just a string bullet", item_ids: [] },
    ]);
  });

  it("accepts a top-level {en, vi} shape", () => {
    expect(
      normalizeTldr({
        en: [{ text: "A", item_ids: ["1"] }],
        vi: [{ text: "B", item_ids: ["1"] }],
      })
    ).toEqual({
      bullets_en: [{ text: "A", item_ids: ["1"] }],
      bullets_vi: [{ text: "B", item_ids: ["1"] }],
    });
  });

  it("returns empty arrays for garbage input", () => {
    expect(normalizeTldr(null)).toEqual({ bullets_en: [], bullets_vi: [] });
    expect(normalizeTldr("a string")).toEqual({
      bullets_en: [],
      bullets_vi: [],
    });
    expect(normalizeTldr({})).toEqual({ bullets_en: [], bullets_vi: [] });
  });
});

describe("generateTldr", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a well-formed fenced response on the first attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse(
          `\`\`\`json\n${JSON.stringify({
            bullets_en: [{ text: "A", item_ids: ["1"] }],
            bullets_vi: [{ text: "B", item_ids: ["1"] }],
          })}\n\`\`\``
        )
      )
    );

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.bullets_en).toHaveLength(1);
  });

  it("accepts a prose-wrapped alternate-shape response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse(
          `Here you go: ${JSON.stringify({
            bullets: {
              en: [{ text: "A", item_ids: ["1"] }],
              vi: [{ text: "B", item_ids: ["1"] }],
            },
          })}`
        )
      )
    );

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(result.bullets_en).toEqual([{ text: "A", item_ids: ["1"] }]);
    expect(result.bullets_vi).toEqual([{ text: "B", item_ids: ["1"] }]);
  });

  it("retries once when the first attempt returns empty bullets, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        chatResponse(JSON.stringify({ bullets_en: [], bullets_vi: [] }))
      )
      .mockResolvedValueOnce(
        chatResponse(
          JSON.stringify({
            bullets_en: [{ text: "A", item_ids: ["1"] }],
            bullets_vi: [{ text: "B", item_ids: ["1"] }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.bullets_en).toHaveLength(1);
  });

  it("retries once when the first attempt is unparseable, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("not json at all, no braces"))
      .mockResolvedValueOnce(
        chatResponse(
          JSON.stringify({
            bullets_en: [{ text: "A", item_ids: ["1"] }],
            bullets_vi: [{ text: "B", item_ids: ["1"] }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.bullets_en).toHaveLength(1);
  });

  it("gives up after two empty/unparseable attempts and returns empty, never throwing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("still no json"))
      .mockResolvedValueOnce(
        chatResponse(JSON.stringify({ bullets_en: [], bullets_vi: [] }))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.bullets_en).toEqual([]);
    expect(result.bullets_vi).toEqual([]);
    expect(result.tokens).toBe(0); // no usage field in these mocked responses
    expect(result.error).toBeTruthy();
  });

  it("asks for at most N bullets matching the input, not exactly 16", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        chatResponse(JSON.stringify({ bullets_en: [], bullets_vi: [] }))
      );
    vi.stubGlobal("fetch", fetchMock);

    await generateTldr(env, [
      { id: "1", title: "Story one" },
      { id: "2", title: "Story two" },
    ]);

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = messages[1].content as string;
    expect(prompt).toMatch(/at most 2/);
    expect(prompt).not.toMatch(/exactly 16/);
  });

  it("asks for ~2-sentence / 180–240 character digest bullets, not a paragraph", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        chatResponse(JSON.stringify({ bullets_en: [], bullets_vi: [] }))
      );
    vi.stubGlobal("fetch", fetchMock);

    await generateTldr(env, [{ id: "1", title: "Story" }]);

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = messages[1].content as string;
    expect(prompt).toMatch(/180–240/);
    expect(prompt).toMatch(/2 sentences/);
    expect(prompt).toMatch(/not an article/);
    expect(prompt).toMatch(/do not write a paragraph/i);
    expect(prompt).toMatch(/named entities/);
  });

  it("retries English-only without the VI style prompt after a bilingual miss", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse("still no json"))
      .mockResolvedValueOnce(
        chatResponse(
          JSON.stringify({
            bullets_en: [{ text: "A", item_ids: ["1"] }],
            bullets_vi: [],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0].role).toBe("user");
    expect(second.messages[0].content).toMatch(/English only/);
    expect(result.bullets_en).toHaveLength(1);
  });

  it("advances the bilingual chain when the first model returns EN-only bullets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          JSON.stringify({
            bullets_en: [{ text: "A", item_ids: ["1"] }],
            bullets_vi: [],
          })
        )
      )
      .mockResolvedValueOnce(
        chatResponse(
          JSON.stringify({
            bullets_en: [{ text: "A", item_ids: ["1"] }],
            bullets_vi: [{ text: "B", item_ids: ["1"] }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTldr(
      { ...env, ANYROUTER_TLDR_MODEL: "en-only/model,ok/model" },
      [{ id: "1", title: "Story" }]
    );
    expect(
      fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).model)
    ).toEqual(["en-only/model", "ok/model"]);
    expect(result.bullets_vi).toEqual([{ text: "B", item_ids: ["1"] }]);
  });
});

describe("streaming anyrouter responses", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const scoreInput = [{ i: 0, title: "Story", source: "hn" }];
  const scorePayload = JSON.stringify({
    results: [
      {
        i: 0,
        relevance: 0.9,
        importance: 7,
        quality: 8,
        category: "Models",
        tags: ["ai"],
      },
    ],
  });

  /** Splits an SSE body into fixed-size chunks so `data:` lines land across
   * chunk boundaries, the way they do on a real connection. */
  function chunkedResponse(body: string, chunkSize: number): Response {
    const bytes = new TextEncoder().encode(body);
    let offset = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
        },
      }),
      { status: 200 }
    );
  }

  // Captured verbatim from a live anyrouter stream. Usage arrives twice: once
  // top-level in snake_case on the penultimate chunk, once nested camelCase in
  // the trailing anyrouter_metadata frame. Also exercises the `p` padding
  // field, `reasoning: null`, empty content deltas, and empty `choices`.
  it("reads usage from a real anyrouter stream tail", async () => {
    const tail = [
      {
        p: "a3ff8e4286",
        id: "gen-1786868498-zFY2O9DpqT4HnClmpHRa",
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: { content: "", role: "assistant", reasoning: null },
            finish_reason: "stop",
          },
        ],
      },
      {
        p: "c2e8",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "", role: "assistant" } }],
        usage: {
          prompt_tokens: 21,
          completion_tokens: 90,
          total_tokens: 111,
          cost: 0.00005,
        },
      },
      {
        id: "req_32da69d84d50409790065d25",
        object: "chat.completion.chunk",
        choices: [],
        anyrouter_metadata: {
          requestId: "req_32da69d84d50409790065d25",
          usage: {
            inputTokens: 21,
            outputTokens: 90,
            cachedTokens: 0,
            totalTokens: 111,
          },
          finishReason: "stop",
        },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { choices: [{ delta: { content: scorePayload } }] },
            ...tail,
          ])
        )
    );

    const results = await scoreItems(env, scoreInput);
    expect(results).toHaveLength(1);
    expect(results[0].tokens).toBe(111);
  });

  // The Vietnamese house style lives in a system message; losing it silently
  // regresses output to literal, calqued translation.
  it("sends the Vietnamese style rules as a system message when translating", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(env, [{ i: 0, title: "New model released" }]);

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/natural, fluent Vietnamese/);
    expect(messages[0].content).toMatch(/mã nguồn mở/);
    expect(messages[1].role).toBe("user");
  });

  // Regression: a real bad translation ("bầy (swarm)", "đã ghi nhận những
  // lỗi phối hợp") slipped through before these rules existed.
  it("style rules explicitly forbid parenthetical glosses and calques, with a worked example", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(env, [{ i: 0, title: "New model released" }]);

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    const style = messages[0].content as string;
    expect(style).toMatch(/parenthetical/i);
    expect(style).toMatch(/calque/i);
    expect(style).toContain("bầy (swarm)"); // the bad-example anchor
    expect(style).toContain("cho thấy chúng phối hợp lỗi"); // the good-example anchor
  });

  it("locks the translate rules overview ahead of the length rule", () => {
    expect(RULES_OVERVIEW).toBe(
      `Keep every fact: names, numbers, dates, who did what, and hedges such as "may" or "reportedly". Add nothing.
Translate every summary sentence. Merging two clauses is allowed only when every fact remains. Cutting a sentence is a failed translation.
Write a Vietnamese headline in sentence case: the first word and proper names only. Returning the English title unchanged is a failed translation, unless that title is already Vietnamese.
No English gloss in parentheses. Write "RAG", not "RAG (Retrieval-Augmented Generation)". A year, a percent, or a bare label such as "(SEC)" or "(YC S22)" may stay.
A vague word is not a number. "Countless" is not "hàng triệu". Do not swap who did what: if A accuses B, do not write B's thing of A.`
    );
  });

  it("puts that overview in the translate user message and keeps the 80% rule", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(env, [{ i: 0, title: "New model released" }]);

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    const user = messages[1].content as string;
    const overviewAt = user.indexOf(RULES_OVERVIEW);
    expect(overviewAt).toBeGreaterThan(-1);
    expect(user.indexOf("at least 80% of its length")).toBeGreaterThan(
      overviewAt
    );
    expect(user).toContain('"(SEC)"');
    expect(user).toContain('"(YC S22)"');
    expect(user).toContain("Clef ra mắt decision model open-weight");
    expect(messages[0].content).not.toContain(RULES_OVERVIEW);
  });

  it("sends the same Vietnamese style rules as a system message when generating the TL;DR", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        chatResponse(JSON.stringify({ bullets_en: [], bullets_vi: [] }))
      );
    vi.stubGlobal("fetch", fetchMock);

    await generateTldr(env, [{ id: "1", title: "Story" }]);

    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toMatch(/parenthetical/i);
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("about 2 sentences");
    expect(messages[1].content).toContain(
      "the why must come from the cited items"
    );
    expect(messages[1].content).not.toContain(
      "Cutting a sentence is a failed translation"
    );
  });

  it("requests a stream so anyrouter answers inline instead of queuing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await scoreItems(env, scoreInput);

    const chatCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/chat/completions")
    );
    expect(chatCall).toBeTruthy();
    expect(JSON.parse(chatCall?.[1].body).stream).toBe(true);
  });

  it("joins content deltas split across chunk boundaries", async () => {
    const body = sseBody(
      // One delta per character, so reassembly is doing real work.
      [...scorePayload].map((char) => ({
        choices: [{ delta: { content: char } }],
      }))
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chunkedResponse(body, 7)));

    const results = await scoreItems(env, scoreInput);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Models");
  });

  // Production 2026-09-29/30: every TL;DR call failed because the output
  // bound counted SSE framing. A ~5K-token answer streams >1MB raw while
  // its content is only ~20K chars, so the bound tripped mid-stream.
  it("bounds streamed content, not SSE framing, for a long TL;DR", async () => {
    const payload = JSON.stringify({
      bullets_en: [{ text: "A".repeat(4000), item_ids: ["1"] }],
      bullets_vi: [{ text: "B".repeat(4000), item_ids: ["1"] }],
    });
    const envelope = { provider: "x".repeat(200), finishReason: null };
    const body = sseBody(
      [...payload].map((char) => ({
        choices: [{ delta: { content: char } }],
        anyrouter_metadata: envelope,
      }))
    );
    expect(body.length).toBeGreaterThan(1_000_000);
    expect(payload.length).toBeLessThan(100_000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chunkedResponse(body, 4096))
    );

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toBeUndefined();
    expect(result.bullets_vi[0].text).toHaveLength(4000);
  });

  it("still rejects streamed content past the output bound", async () => {
    const body = sseBody([
      { choices: [{ delta: { content: "x".repeat(100_001) } }] },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chunkedResponse(body, 4096))
    );

    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(result.bullets_en).toEqual([]);
    expect(result.error).toMatch(/chain exhausted/);
  });

  it("takes tokens from the camelCase usage on the final metadata event", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { choices: [{ delta: { content: scorePayload } }] },
            { usage: { inputTokens: 40, outputTokens: 60, totalTokens: 100 } },
          ])
        )
    );

    const results = await scoreItems(env, scoreInput);
    expect(results[0].tokens).toBe(100);
  });

  // The trailing frame is documented as carrying an `anyrouter_metadata`
  // envelope, so usage must be found there too or token accounting reads zero.
  it("takes tokens from usage nested in the metadata envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          { choices: [{ delta: { content: scorePayload } }] },
          {
            type: "response.anyrouter.metadata",
            anyrouter_metadata: { usage: { totalTokens: 88 } },
          },
        ])
      )
    );

    const results = await scoreItems(env, scoreInput);
    expect(results[0].tokens).toBe(88);
  });

  it("sums input/output tokens when no total is reported", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { choices: [{ delta: { content: scorePayload } }] },
            { usage: { inputTokens: 40, outputTokens: 60 } },
          ])
        )
    );

    const results = await scoreItems(env, scoreInput);
    expect(results[0].tokens).toBe(100);
  });

  it("still accepts snake_case usage from a non-streaming-shaped event", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { choices: [{ delta: { content: scorePayload } }] },
            { usage: { total_tokens: 77 } },
          ])
        )
    );

    const results = await scoreItems(env, scoreInput);
    expect(results[0].tokens).toBe(77);
  });

  it("falls back to reasoning deltas when no content is streamed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            { choices: [{ delta: { reasoning: "Thinking. Final answer: " } }] },
            { choices: [{ delta: { reasoning: scorePayload } }] },
          ])
        )
    );

    const results = await scoreItems(env, scoreInput);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Models");
  });

  it("skips the batch when the stream carries no parseable events", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("data: {not json\n\ndata: [DONE]\n\n", { status: 200 })
        )
    );

    expect(await scoreItems(env, scoreInput)).toEqual([]);
  });

  // Streaming is supposed to bypass the queue; if a queue receipt ever comes
  // back anyway it must fail cleanly rather than look like an empty answer.
  it("surfaces a queue receipt as an error and skips the batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          object: "chat.completion.queued",
          id: "req_abc123",
          choices: [],
          queue_position: 3,
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await scoreItems(env, scoreInput)).toEqual([]);
    // No re-post: the queue has no retrieval endpoint, so the chat hop
    // is not retried. Jev is a separate /systemone attempt before that.
    const chatCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/chat/completions")
    );
    expect(chatCalls).toHaveLength(1);
  });
});

describe("model fallback chain", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const scoreInput = [{ i: 0, title: "Story", source: "hn" }];
  const scorePayload = JSON.stringify({
    results: [
      {
        i: 0,
        relevance: 0.9,
        importance: 7,
        quality: 8,
        category: "Models",
        tags: ["ai"],
      },
    ],
  });

  function sseResponse(events: unknown[]): Response {
    return new Response(
      `${events
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("")}data: [DONE]\n\n`,
      { status: 200 }
    );
  }

  function completion(content: string): Response {
    return sseResponse([{ choices: [{ delta: { content } }] }]);
  }

  function modelsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1].body).model as string
    );
  }

  function chatModelsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls
      .filter((call) => String(call[0]).includes("/chat/completions"))
      .map((call) => JSON.parse(call[1].body).model as string);
  }

  /** Jev runs before the chat chain. Keep a scripted chat sequence from
   * being consumed by the /systemone attempt. */
  function withJevDown(
    chat: (url: string, init?: RequestInit) => Promise<Response> | Response
  ) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/systemone")) {
        return new Response("jev down", { status: 422 });
      }
      return chat(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const chain = {
    ...env,
    ANYROUTER_MODEL: "first/model,second/model,third/model",
  };

  it("uses the single configured model when no chain is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(scorePayload));
    vi.stubGlobal("fetch", fetchMock);

    await scoreItems(env, scoreInput);
    expect(chatModelsOf(fetchMock)).toEqual(["test-model"]);
  });

  it("stops at the first model that succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(scorePayload));
    vi.stubGlobal("fetch", fetchMock);

    const results = await scoreItems(chain, scoreInput);
    expect(chatModelsOf(fetchMock)).toEqual(["first/model"]);
    expect(results).toHaveLength(1);
  });

  it("advances past a transport error and a non-200", async () => {
    const chat = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(new Response("upstream down", { status: 502 }))
      .mockResolvedValueOnce(completion(scorePayload));
    withJevDown(chat);

    const results = await scoreItems(chain, scoreInput);
    expect(modelsOf(chat)).toEqual([
      "first/model",
      "second/model",
      "third/model",
    ]);
    expect(results[0].category).toBe("Models");
  });

  it("advances past 404, 429, and 402 so a delisted primary cannot stall the chain", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(new Response("model not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response("insufficient credits", { status: 402 })
      )
      .mockResolvedValueOnce(completion(scorePayload));
    withJevDown(chat);

    const results = await scoreItems(
      {
        ...env,
        ANYROUTER_MODEL: "gone/model,busy/model,broke/model,ok/model",
      },
      scoreInput
    );
    expect(modelsOf(chat)).toEqual([
      "gone/model",
      "busy/model",
      "broke/model",
      "ok/model",
    ]);
    expect(results[0].category).toBe("Models");
  });

  it("advances when a model streams an empty completion", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce(sseResponse([{ choices: [{ delta: {} }] }]))
      .mockResolvedValueOnce(completion(scorePayload));
    withJevDown(chat);

    const results = await scoreItems(chain, scoreInput);
    expect(modelsOf(chat)).toEqual(["first/model", "second/model"]);
    expect(results).toHaveLength(1);
  });

  it("skips the batch when every model in the chain fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await scoreItems(chain, scoreInput)).toEqual([]);
    expect(chatModelsOf(fetchMock)).toEqual([
      "first/model",
      "second/model",
      "third/model",
    ]);
  });

  it("tolerates blank entries and whitespace in the chain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion(scorePayload));
    vi.stubGlobal("fetch", fetchMock);

    await scoreItems(
      { ...env, ANYROUTER_MODEL: " , solo/model , " },
      scoreInput
    );
    expect(chatModelsOf(fetchMock)).toEqual(["solo/model"]);
  });

  it("keeps Jev scores and skips chat when systemone succeeds", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes("/systemone")) {
        return new Response("chat should not run", { status: 500 });
      }
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        model?: string;
        questions?: Record<string, { type?: string }>;
      };
      expect(body.model).toBe("typesafe/jev");
      expect(body.questions?.is_ai_tech?.type).toBe("noul");
      expect(body.questions?.importance?.type).toBe("score");
      expect(body.questions?.category?.type).toBe("choice");
      return Response.json({
        model: "typesafe/jev",
        answers: {
          is_ai_tech: { type: "noul", noul: 0.91 },
          importance: { type: "score", score: "7" },
          quality: { type: "score", score: "8" },
          category: { type: "choice", choice: "Models" },
          entity: { type: "choice", choice: "openai" },
          theme: { type: "choice", choice: "llm" },
        },
        usage: { input_tokens: 40, output_tokens: 0, cost: 0 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await scoreItems(env, scoreInput);
    expect(chatModelsOf(fetchMock)).toEqual([]);
    expect(results).toEqual([
      {
        i: 0,
        relevance: 0.91,
        importance: 7,
        quality: 8,
        category: "Models",
        tags: ["openai", "llm"],
        tokens: 40,
      },
    ]);
  });

  it("scores with the chat chain when Jev fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/systemone")) {
        return new Response("jev down", { status: 422 });
      }
      return completion(scorePayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await scoreItems(env, scoreInput);
    expect(chatModelsOf(fetchMock)).toEqual(["test-model"]);
    expect(results).toHaveLength(1);
    expect(results[0]?.category).toBe("Models");
    expect(results[0]?.tags).toEqual(["ai"]);
  });

  it("asks chat only for items Jev missed", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/systemone")) {
        const body = JSON.parse((init?.body as string) ?? "{}") as {
          state?: { i?: number };
        };
        if (body.state?.i === 0) {
          return Response.json({
            model: "typesafe/jev",
            answers: {
              is_ai_tech: { type: "noul", noul: 0.8 },
              importance: { type: "score", score: "6" },
              quality: { type: "score", score: "9" },
              category: { type: "choice", choice: "Research" },
              entity: { type: "choice", choice: "none" },
              theme: { type: "choice", choice: "agent" },
            },
            usage: { input_tokens: 12, output_tokens: 0, cost: 0 },
          });
        }
        return new Response("jev down", { status: 422 });
      }
      return completion(
        JSON.stringify({
          results: [
            {
              i: 1,
              relevance: 0.4,
              importance: 3,
              quality: 4,
              category: "Products",
              tags: ["chip"],
            },
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await scoreItems(env, [
      { i: 0, title: "Paper", source: "hf" },
      { i: 1, title: "Gadget", source: "hn" },
    ]);
    expect(chatModelsOf(fetchMock)).toEqual(["test-model"]);
    const chatCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/chat/completions")
    );
    const chatInit = chatCall?.[1] as { body?: string } | undefined;
    if (!chatInit?.body) throw new Error("expected a chat fallback call");
    const chatBody = JSON.parse(chatInit.body) as {
      messages: { content: string }[];
    };
    expect(chatBody.messages[0]?.content).toContain("Gadget");
    expect(chatBody.messages[0]?.content).not.toContain("Paper");
    expect(results).toEqual([
      {
        i: 0,
        relevance: 0.8,
        importance: 6,
        quality: 9,
        category: "Research",
        tags: ["agent"],
        tokens: 12,
      },
      {
        i: 1,
        relevance: 0.4,
        importance: 3,
        quality: 4,
        category: "Products",
        tags: ["chip"],
        tokens: 0,
      },
    ]);
  });

  it("skips Jev when no AnyRouter key is configured", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/chat/completions");
      return completion(scorePayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await scoreItems(
      { ...env, ANYROUTER_API_KEY: "" },
      scoreInput
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
  });

  describe("decision router before Jev", () => {
    it("accepts only answers served by Jev", () => {
      const r = (upstreamModel: string, upstreamProvider: string) => ({
        answers: {},
        inputTokens: 0,
        upstreamModel,
        upstreamProvider,
      });
      expect(servedByJev(r("jev-1.13.0", "typesafe-byok"))).toBe(true);
      expect(servedByJev(r("typesafe/jev", ""))).toBe(true);
      expect(servedByJev(r("fastino/gliner2.5-multi-v1", "fastino-byok"))).toBe(
        false
      );
      expect(servedByJev(r("jev-1.13.0", "fastino-byok"))).toBe(false);
      expect(servedByJev(r("", ""))).toBe(false);
    });

    const decisionEnv = {
      ...env,
      ANYROUTER_DECISION_MODEL: "anyrouter/decision",
    };
    const jevAnswers = (importance: string) => ({
      is_ai_tech: { type: "noul", noul: 0.9 },
      importance: { type: "score", score: importance },
      quality: { type: "score", score: "8" },
      category: { type: "choice", choice: "Models" },
      entity: { type: "choice", choice: "openai" },
      theme: { type: "choice", choice: "llm" },
    });
    const systemOneModelsOf = (fetchMock: ReturnType<typeof vi.fn>) =>
      fetchMock.mock.calls
        .filter((call) => String(call[0]).includes("/systemone"))
        .map(
          (call) =>
            (
              JSON.parse((call[1] as RequestInit).body as string) as {
                model: string;
              }
            ).model
        );

    it("uses the decision answer and never calls Jev or chat", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (!String(url).includes("/systemone")) {
          return new Response("chat should not run", { status: 500 });
        }
        return Response.json({
          model: "jev-1.13.0",
          answers: jevAnswers("9"),
          usage: { input_tokens: 30, output_tokens: 0, cost: 0 },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const results = await scoreItems(decisionEnv, scoreInput);
      expect(systemOneModelsOf(fetchMock)).toEqual(["anyrouter/decision"]);
      expect(chatModelsOf(fetchMock)).toEqual([]);
      expect(results[0]?.importance).toBe(9);
    });

    it("falls to Jev when decision fails, then to chat when both fail", async () => {
      const jevOk = vi.fn(async (_url: string, init?: RequestInit) => {
        const { model } = JSON.parse(init?.body as string) as {
          model: string;
        };
        if (model === "anyrouter/decision") {
          return new Response("decision down", { status: 502 });
        }
        return Response.json({
          model: "typesafe/jev",
          answers: jevAnswers("5"),
          usage: { input_tokens: 10, output_tokens: 0, cost: 0 },
        });
      });
      vi.stubGlobal("fetch", jevOk);
      const viaJev = await scoreItems(decisionEnv, scoreInput);
      expect(systemOneModelsOf(jevOk)).toEqual([
        "anyrouter/decision",
        "typesafe/jev",
      ]);
      expect(chatModelsOf(jevOk)).toEqual([]);
      expect(viaJev[0]?.importance).toBe(5);

      const allDown = vi.fn(async (url: string) =>
        String(url).includes("/systemone")
          ? new Response("down", { status: 502 })
          : completion(scorePayload)
      );
      vi.stubGlobal("fetch", allDown);
      const viaChat = await scoreItems(decisionEnv, scoreInput);
      expect(systemOneModelsOf(allDown)).toEqual([
        "anyrouter/decision",
        "typesafe/jev",
      ]);
      expect(chatModelsOf(allDown)).toEqual(["test-model"]);
      expect(viaChat[0]?.category).toBe("Models");
    });

    // anyrouter/decision reroutes to GLiNER when Jev is unavailable. Its
    // score answers parse (importance 1, quality 0 for a frontier launch) but
    // are not on Jev's calibrated scale, so the item must move on to Jev.
    it("rejects a degenerate decision answer and sends that item to Jev", async () => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as {
          model: string;
          state: { i: number };
        };
        if (body.model === "anyrouter/decision" && body.state.i === 1) {
          return Response.json({
            model: "fastino/gliner2.5-multi-v1",
            anyrouter_metadata: {
              model: "anyrouter/decision",
              requestId: "req_gliner",
              upstream: { provider: "fastino-byok" },
            },
            answers: {
              ...jevAnswers("1"),
              importance: {
                type: "score",
                score: 0,
                probabilities: { "0": 0.24 },
              },
              quality: { type: "score", score: "0" },
            },
            usage: { input_tokens: 5, output_tokens: 0, cost: 0 },
          });
        }
        return Response.json({
          model: "jev-1.13.0",
          answers: jevAnswers(body.model === "typesafe/jev" ? "4" : "8"),
          usage: { input_tokens: 10, output_tokens: 0, cost: 0 },
        });
      });
      vi.stubGlobal("fetch", fetchMock);
      const entries: LlmCallLogEntry[] = [];
      setLlmCallLogger((entry) => {
        entries.push(entry);
      });

      const results = await scoreItems(decisionEnv, [
        { i: 0, title: "Launch", source: "openai.com" },
        { i: 1, title: "Gadget", source: "hn" },
      ]).finally(() => setLlmCallLogger(null));
      // llm_calls records which upstream actually served the router call.
      expect(entries.find((e) => e.requestId === "req_gliner")).toMatchObject({
        task: "score",
        model: "anyrouter/decision",
        route: ["anyrouter/decision", "fastino/gliner2.5-multi-v1"],
        provider: "fastino-byok",
      });
      expect(systemOneModelsOf(fetchMock)).toEqual([
        "anyrouter/decision",
        "anyrouter/decision",
        "typesafe/jev",
      ]);
      expect(chatModelsOf(fetchMock)).toEqual([]);
      expect(results.map((r) => [r.i, r.importance])).toEqual([
        [0, 8],
        [1, 4],
      ]);
    });
  });

  it("prefers the per-task translate model over ANYROUTER_MODEL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completion(
        JSON.stringify({
          results: [{ i: 0, title: "Tin", summary: "Tóm tắt" }],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(
      { ...chain, ANYROUTER_TRANSLATE_MODEL: "aisingapore/gemma-sea-lion" },
      [{ i: 0, title: "Story" }]
    );
    expect(modelsOf(fetchMock)).toEqual(["aisingapore/gemma-sea-lion"]);
  });

  it("prefers the per-task tldr model over ANYROUTER_MODEL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completion(
        JSON.stringify({
          bullets_en: [{ text: "A", item_ids: ["1"] }],
          bullets_vi: [{ text: "B", item_ids: ["1"] }],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateTldr({ ...chain, ANYROUTER_TLDR_MODEL: "tldr/model" }, [
      { id: "1", title: "Story" },
    ]);
    expect(modelsOf(fetchMock)).toEqual(["tldr/model"]);
  });

  it("falls back to ANYROUTER_MODEL when the per-task override is unset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      completion(
        JSON.stringify({
          results: [{ i: 0, title: "Tin", summary: "Tóm tắt" }],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(chain, [{ i: 0, title: "Story" }]);
    expect(modelsOf(fetchMock)).toEqual(["first/model"]);
  });

  it("uses the whole chain when a per-task override lists several models", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({
            results: [{ i: 0, title: "Tin", summary: "Tóm tắt" }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(
      { ...env, ANYROUTER_TRANSLATE_MODEL: "vi/primary,vi/backup" },
      [{ i: 0, title: "Story" }]
    );
    expect(modelsOf(fetchMock)).toEqual(["vi/primary", "vi/backup"]);
  });

  it("splits translate work into batches of 3 so a 90s attempt can finish", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const call = fetchMock.mock.calls.length;
      const indexes = call === 1 ? [0, 1, 2] : [3];
      return completion(
        JSON.stringify({
          results: indexes.map((i) => ({
            i,
            title: "Tin",
            summary: "Tóm tắt",
          })),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateItems(
      env,
      [0, 1, 2, 3].map((i) => ({ i, title: `Story ${i}` }))
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.map((row) => row.i)).toEqual([0, 1, 2, 3]);
  });

  it("retries title-only when a batch with summaries fails accept", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion(JSON.stringify({ results: [] })))
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({
            results: [{ i: 0, title: "Tin GLM-5.3", summary: "" }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateItems(env, [
      { i: 0, title: "GLM-5.3 Ties Kimi", summary: "A long English summary." },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(
      (fetchMock.mock.calls[1][1] as { body: string }).body
    ) as { messages: { role: string; content: string }[] };
    const user = second.messages.find((m) => m.role === "user")?.content ?? "";
    expect(user).toContain("GLM-5.3 Ties Kimi");
    expect(user).not.toContain("A long English summary.");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Tin GLM-5.3");
  });

  it("copies an already-Vietnamese title without calling the LLM", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateItems(env, [
      {
        i: 0,
        title: "GLM-5.3 hòa Kimi K3 mô hình nguồn mở thông minh nhất",
        summary: "Tóm tắt sẵn có.",
        sourceLang: "vi",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        i: 0,
        title: "GLM-5.3 hòa Kimi K3 mô hình nguồn mở thông minh nhất",
        summary: "Tóm tắt sẵn có.",
        tokens: 0,
      },
    ]);
  });

  it("retries leftover items one at a time after a batch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion(JSON.stringify({ results: [] })))
      .mockResolvedValueOnce(
        completion(JSON.stringify({ results: [{ i: 0, title: "Tin A" }] }))
      )
      .mockResolvedValueOnce(
        completion(JSON.stringify({ results: [{ i: 1, title: "Tin B" }] }))
      );
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateItems(env, [
      { i: 0, title: "Story A" },
      { i: 1, title: "Story B" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results.map((row) => row.title).sort()).toEqual(["Tin A", "Tin B"]);
  });

  it("advances past a hanging model via raceTimeout so the next id can run", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockResolvedValueOnce(
          completion(JSON.stringify({ results: [{ i: 0, title: "Tin" }] }))
        );
      vi.stubGlobal("fetch", fetchMock);

      const pending = callAnyrouter(
        { ...env, ANYROUTER_MODEL: "hang/model,ok/model" },
        [{ role: "user", content: "hi" }],
        { timeoutMs: 200, json: true }
      );
      await vi.advanceTimersByTimeAsync(100);
      const result = await pending;
      expect(modelsOf(fetchMock)).toEqual(["hang/model", "ok/model"]);
      expect(result.content).toContain("Tin");
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts the hanging fetch so the leaked stream does not block fallback", async () => {
    vi.useFakeTimers();
    try {
      let hangingSignal: AbortSignal | undefined;
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(
          (_url: string, init: { signal?: AbortSignal }) => {
            hangingSignal = init.signal;
            return new Promise(() => {});
          }
        )
        .mockResolvedValueOnce(
          completion(JSON.stringify({ results: [{ i: 0, title: "Tin" }] }))
        );
      vi.stubGlobal("fetch", fetchMock);

      const pending = callAnyrouter(
        { ...env, ANYROUTER_MODEL: "hang/model,ok/model" },
        [{ role: "user", content: "hi" }],
        { timeoutMs: 200, json: true }
      );
      await vi.advanceTimersByTimeAsync(100);
      await pending;
      expect(hangingSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists every attempted model when the chain is exhausted", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("server error", { status: 500 }))
    );
    await expect(
      callAnyrouter(
        { ...env, ANYROUTER_MODEL: "one/model,two/model" },
        [{ role: "user", content: "hi" }],
        { timeoutMs: 5000 }
      )
    ).rejects.toThrow(/chain exhausted[\s\S]*one\/model[\s\S]*two\/model/);
    error.mockRestore();
  });

  it("advances when the first model returns JSON that sanitize drops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion(JSON.stringify({ results: [] })))
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({
            results: [{ i: 0, title: "Tin mới", summary: "Tóm tắt" }],
          })
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const results = await translateItems(
      { ...env, ANYROUTER_TRANSLATE_MODEL: "empty/model,ok/model" },
      [{ i: 0, title: "Story" }]
    );
    expect(modelsOf(fetchMock)).toEqual(["empty/model", "ok/model"]);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Tin mới");
  });
});

describe("scoreItems / translateItems batch failure handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips a batch when the anyrouter call fails, without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() => new Response("server error", { status: 500 }))
    );

    const results = await scoreItems(env, [
      { i: 0, title: "New AI model released", source: "hn" },
    ]);
    expect(results).toEqual([]);
  });

  it("skips a batch when the response body is malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
            { status: 200 }
          )
        )
    );

    const results = await translateItems(env, [{ i: 0, title: "Hello" }]);
    expect(results).toEqual([]);
  });

  it("logs a structured reason when a translate batch fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("server error", { status: 500 }))
    );

    const results = await translateItems(env, [
      { i: 0, title: "Hello" },
      { i: 1, title: "World" },
    ]);
    expect(results).toEqual([]);

    const payload = error.mock.calls
      .map((call) => call[0])
      .find(
        (line): line is string =>
          typeof line === "string" &&
          line.includes("translateItems.batch_failed")
      );
    expect(payload).toBeDefined();
    const parsed = JSON.parse(payload as string) as {
      event: string;
      reason: string;
      batchSize: number;
      indexes: number[];
    };
    expect(parsed.event).toBe("translateItems.batch_failed");
    expect(parsed.reason).toMatch(
      /anyrouter request failed: 500|chain exhausted|unusable/
    );
    expect(parsed.batchSize).toBe(2);
    expect(parsed.indexes).toEqual([0, 1]);
    error.mockRestore();
  });

  it("parses a well-formed scoring response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse(
          JSON.stringify({
            results: [
              {
                i: 0,
                relevance: 0.9,
                importance: 7,
                quality: 8,
                category: "Models",
                tags: ["gpt"],
              },
            ],
          })
        )
      )
    );

    const results = await scoreItems(env, [
      { i: 0, title: "New model released", source: "hn" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Models");
  });

  it("sends a generous max_tokens so reasoning can't starve the answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await scoreItems(env, [{ i: 0, title: "Story", source: "hn" }]);

    const chatCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/chat/completions")
    );
    const body = JSON.parse(chatCall?.[1].body);
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it("sends app-attribution headers so usage shows up in the anyrouter dashboard", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(chatResponse(JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await scoreItems(env, [{ i: 0, title: "Story", source: "hn" }]);

    const { headers } = fetchMock.mock.calls[0][1];
    expect(headers["HTTP-Referer"]).toBe("https://aidr.today");
    expect(headers["X-Title"]).toBe("AI;DR");
    expect(headers["X-AnyRouter-Title"]).toBe("AI;DR");
    expect(headers["X-AnyRouter-Source"]).toBe("web-app");
    expect(headers["X-AnyRouter-Categories"]).toBe("writing-assistant");
  });

  it("falls back to extracting JSON from message.reasoning when content is empty (reasoning-model quirk)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reasoningResponse(
          `Let me analyze this story... it's clearly about AI. Final answer: ${JSON.stringify(
            {
              results: [
                {
                  i: 0,
                  relevance: 0.9,
                  importance: 7,
                  quality: 8,
                  category: "Models",
                  tags: ["gpt"],
                },
              ],
            }
          )}`
        )
      )
    );

    const results = await scoreItems(env, [
      { i: 0, title: "New model released", source: "hn" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Models");
  });

  it("skips the batch when both content and reasoning are empty/missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: {} }] }), {
          status: 200,
        })
      )
    );

    const results = await scoreItems(env, [
      { i: 0, title: "Story", source: "hn" },
    ]);
    expect(results).toEqual([]);
  });

  it("attributes a batch's total tokens evenly across every requested item, rounding up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponseWithUsage(
          JSON.stringify({
            results: [
              {
                i: 0,
                relevance: 0.9,
                importance: 7,
                quality: 8,
                category: "Models",
                tags: [],
              },
              {
                i: 1,
                relevance: 0.8,
                importance: 6,
                quality: 7,
                category: "Products",
                tags: [],
              },
              {
                i: 2,
                relevance: 0.7,
                importance: 5,
                quality: 6,
                category: "Research",
                tags: [],
              },
            ],
          }),
          100 // 100 tokens / 3 items -> ceil(33.33) = 34 per item
        )
      )
    );

    const results = await scoreItems(env, [
      { i: 0, title: "A", source: "hn" },
      { i: 1, title: "B", source: "hn" },
      { i: 2, title: "C", source: "hn" },
    ]);

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.tokens).toBe(34);
    }
  });

  it("attributes tokens by the batch's requested size, not the model's returned result count", async () => {
    // The model only returned 1 of 2 requested items (e.g. it dropped one),
    // but the full batch's token cost should still divide by the requested
    // batch size, not by how many results actually came back.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponseWithUsage(
          JSON.stringify({
            results: [
              {
                i: 0,
                relevance: 0.9,
                importance: 7,
                quality: 8,
                category: "Models",
                tags: [],
              },
            ],
          }),
          50
        )
      )
    );

    const results = await scoreItems(env, [
      { i: 0, title: "A", source: "hn" },
      { i: 1, title: "B", source: "hn" },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].tokens).toBe(25); // 50 / 2 requested, not 50 / 1 returned
  });

  it("attributes translateItems tokens evenly across the batch too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponseWithUsage(
          JSON.stringify({
            results: [
              { i: 0, title: "Tiêu đề A", summary: "Tóm tắt A" },
              { i: 1, title: "Tiêu đề B", summary: "Tóm tắt B" },
            ],
          }),
          60
        )
      )
    );

    const results = await translateItems(env, [
      { i: 0, title: "Title A" },
      { i: 1, title: "Title B" },
    ]);

    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.tokens).toBe(30);
    }
  });
});

// setLlmCallLogger installs a fire-and-forget observability sink (see
// worker/llm-call-log.ts's D1-backed implementation); a broken sink must
// never surface through the pipeline it's merely observing.
describe("setLlmCallLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setLlmCallLogger(null);
  });

  const scoreInput = [{ i: 0, title: "Story", source: "hn" }];
  const scorePayload = JSON.stringify({
    results: [
      {
        i: 0,
        relevance: 0.9,
        importance: 7,
        quality: 8,
        category: "Models",
        tags: ["ai"],
      },
    ],
  });

  it("a synchronously-throwing logger does not break scoreItems", async () => {
    setLlmCallLogger(() => {
      throw new Error("logger exploded");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponse(scorePayload))
    );

    const results = await scoreItems(env, scoreInput);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Models");
  });

  it("a rejecting async logger does not break scoreItems", async () => {
    setLlmCallLogger(async () => {
      throw new Error("async logger exploded");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponse(scorePayload))
    );

    const results = await scoreItems(env, scoreInput);
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("Models");
  });
});

describe("VI_STYLE", () => {
  it("good examples restate the bad line and do not add a fact", () => {
    expect(VI_STYLE).toContain("cho thấy chúng phối hợp lỗi");
    expect(VI_STYLE).not.toContain("an toàn AI");
    expect(VI_STYLE).not.toContain("rõ rệt");
    expect(VI_STYLE).toContain("hiệu suất được cải thiện.");
  });

  it("prefers everyday Vietnamese over Sino-Vietnamese formalese", () => {
    expect(VI_STYLE).toContain("sử dụng");
    expect(VI_STYLE).toContain("dùng");
    expect(VI_STYLE).toMatch(/hãng/);
  });

  it("specifies Vietnamese press style for numbers and units", () => {
    expect(VI_STYLE).toMatch(/tỷ|triệu/);
  });

  it("instructs dropping pronouns Vietnamese naturally omits", () => {
    expect(VI_STYLE.toLowerCase()).toContain("pronoun");
  });

  it("warns against clickbait headlines", () => {
    expect(VI_STYLE).toContain("clickbait");
  });

  it("includes at least five distinct bad→good example pairs", () => {
    const badCount = (VI_STYLE.match(/— bad/g) ?? []).length;
    const goodCount = (VI_STYLE.match(/— good/g) ?? []).length;
    expect(badCount).toBeGreaterThanOrEqual(5);
    expect(goodCount).toBeGreaterThanOrEqual(5);
  });

  // Prod bullets 2026-10-04..10 shipped "abonnement" (French) and
  // "các senators"; the style must name both failure shapes.
  it("bans third-language words and needless English plurals", () => {
    expect(VI_STYLE).toContain("Never a word from a third language");
    expect(VI_STYLE).toContain('"abonnement" ✗ → "gói thuê bao" ✓');
    expect(VI_STYLE).toContain('"các senators" ✗ → "các thượng nghị sĩ" ✓');
  });

  it("covers over-formal Sino-Vietnamese, passive voice, and sentence-splitting failure modes", () => {
    expect(VI_STYLE).toContain("Tập đoàn");
    expect(VI_STYLE).toContain("được huấn luyện bởi");
    expect(VI_STYLE).toMatch(/Startup này.*OpenAI/s);
  });
});

// "Rating tests": the exact garbage shapes small fallback-chain models emit,
// and what the sanitizers must make of them before anything touches ranking.
describe("sanitizeScoreResults", () => {
  const batch = [
    { i: 0, title: "a", source: "hn" },
    { i: 1, title: "b", source: "hn" },
  ];

  it("coerces stringified numbers and clamps out-of-range scores", () => {
    const out = sanitizeScoreResults(
      [
        {
          i: "0",
          relevance: "0.9",
          importance: 12,
          quality: -3,
          category: "models",
          tags: ["LLMs "],
        },
      ],
      batch,
      5
    );
    expect(out).toEqual([
      {
        i: 0,
        relevance: 0.9,
        importance: 10,
        quality: 0,
        category: "Models",
        tags: ["llms"],
        tokens: 5,
      },
    ]);
  });

  it("drops hallucinated, duplicate, and NaN-score entries", () => {
    const good = {
      i: 1,
      relevance: 1,
      importance: 5,
      quality: 5,
      category: "Agents",
      tags: [],
    };
    const out = sanitizeScoreResults(
      [
        { ...good, i: 7 }, // index never requested
        { i: 0, relevance: "high", importance: 5, quality: 5 }, // NaN score
        good,
        { ...good, importance: 9 }, // duplicate i=1 — first wins
        "not an object",
        null,
      ],
      batch,
      3
    );
    expect(out).toEqual([{ ...good, tokens: 3 }]);
  });

  it("maps off-enum categories to empty and normalizes messy tags", () => {
    const out = sanitizeScoreResults(
      [
        {
          i: 0,
          relevance: 0.5,
          importance: 5,
          quality: 5,
          category: "AI Stuff",
          tags: [
            "Open Source",
            "multi_agent",
            "open-source",
            42,
            "a".repeat(50),
          ],
        },
      ],
      batch,
      1
    );
    expect(out[0].category).toBe("");
    expect(out[0].tags).toEqual(["open-source", "multi-agent"]);
  });

  it("returns empty for non-array payloads", () => {
    expect(sanitizeScoreResults({ results: [] }, batch, 1)).toEqual([]);
    expect(sanitizeScoreResults("[]", batch, 1)).toEqual([]);
  });
});

describe("sanitizeTranslateResults", () => {
  const batch = [
    { i: 0, title: "Hello" },
    { i: 1, title: "World" },
  ];

  it("keeps only requested indexes with non-empty titles, trimming fields", () => {
    const out = sanitizeTranslateResults(
      [
        { i: 0, title: "  Xin chào  ", summary: " Tóm tắt " },
        { i: 1, title: "", summary: "no title" },
        { i: 2, title: "hallucinated" },
        { i: 0, title: "duplicate" },
        { i: 1, title: "Thế giới", summary: null },
      ],
      batch,
      4
    );
    expect(out).toEqual([
      { i: 0, title: "Xin chào", summary: "Tóm tắt", tokens: 4 },
      { i: 1, title: "Thế giới", summary: "", tokens: 4 },
    ]);
  });

  it("reads index when i is absent, and zips a same-length array onto the batch", () => {
    expect(
      sanitizeTranslateResults(
        [{ index: 1, title: "Thế giới", summary: "Một câu." }],
        batch,
        1
      )
    ).toEqual([{ i: 1, title: "Thế giới", summary: "Một câu.", tokens: 1 }]);
    expect(
      sanitizeTranslateResults(
        [
          { title: "Xin chào", summary: "A" },
          { title: "Thế giới", summary: "B" },
        ],
        batch,
        1
      )
    ).toEqual([
      { i: 0, title: "Xin chào", summary: "A", tokens: 1 },
      { i: 1, title: "Thế giới", summary: "B", tokens: 1 },
    ]);
    expect(sanitizeTranslateResults([{ title: "only one" }], batch, 1)).toEqual(
      []
    );
  });

  it("reads a translations array from Gemini JSON", () => {
    expect(
      parseTranslateRows(
        '{"translations":[{"title":"Xin chào","summary":"Một câu."}]}'
      )
    ).toEqual([{ title: "Xin chào", summary: "Một câu." }]);
  });
});

describe("modelAttemptTimeoutMs", () => {
  it("keeps the 2-model hang test contract: half the budget each", () => {
    expect(modelAttemptTimeoutMs(200, 2)).toBe(100);
  });

  it("gives a long chain more than budget/n, capped at 25s so leftover funds two fallbacks", () => {
    const even = 300_000 / 11;
    expect(even).toBeLessThan(30_000);
    expect(modelAttemptTimeoutMs(300_000, 11)).toBe(25_000);
  });

  it("after a hang-cap, leftover budget still funds the next id", () => {
    expect(modelAttemptTimeoutMs(70_000, 3)).toBe(25_000);
  });

  it("a single remaining model gets the leftover, not a tiny even slice", () => {
    expect(modelAttemptTimeoutMs(12_000, 1)).toBe(12_000);
  });

  it("returns 0 when the deadline has passed", () => {
    expect(modelAttemptTimeoutMs(0, 3)).toBe(0);
    expect(modelAttemptTimeoutMs(-5, 3)).toBe(0);
  });

  it("honors a longer per-task hang-cap for score/tldr JSON", () => {
    expect(modelAttemptTimeoutMs(240_000, 4, 90_000)).toBe(90_000);
    expect(modelAttemptTimeoutMs(70_000, 3, 70_000)).toBe(30_000);
  });

  it("gives a lone remaining auto hop the full translate slice", () => {
    expect(modelAttemptTimeoutMs(70_000, 1, 60_000)).toBe(60_000);
  });
});

describe("normalizeTag", () => {
  it("canonicalizes to lowercase-kebab-case", () => {
    expect(normalizeTag("Open Source")).toBe("open-source");
    expect(normalizeTag("multi_agent")).toBe("multi-agent");
    expect(normalizeTag("  A/B Testing! ")).toBe("a-b-testing");
    expect(normalizeTag("--llm--")).toBe("llm");
  });

  it("rejects junk", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("!!!")).toBeNull();
    expect(normalizeTag(42)).toBeNull();
    expect(normalizeTag("x".repeat(41))).toBeNull();
  });
});

describe("score step budget", () => {
  afterEach(() => {
    setLlmCallLogger(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Two batches of decision 15s + Jev 30s + the 120s chat default are ~330s,
  // past LLM_STEP. The chat call has to pass timeoutMs. Raising the step
  // limit is not the fix.
  it("keeps two score batches strictly inside LLM_STEP", () => {
    expect(LLM_STEP.timeout).toBe("5 minutes");
    const stepMs = 5 * 60_000;
    const oneBatch =
      SCORE_DECISION_TIMEOUT_MS + SCORE_JEV_TIMEOUT_MS + SCORE_CHAT_TIMEOUT_MS;
    expect(oneBatch * 2).toBeLessThan(stepMs);
    // Still a chain budget, not a single 70s slice: a one-id chain can use
    // the hang-cap, and a later id still has time.
    expect(SCORE_CHAT_TIMEOUT_MS).toBeGreaterThan(SCORE_SLICE_MAX_MS);
    expect(SCORE_CHAT_TIMEOUT_MS).toBeLessThan(120_000);
  });

  it("passes that chat budget instead of the 120s request default", async () => {
    vi.useFakeTimers();
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(tokenThenHang));
    const pending = scoreItems(
      {
        ...env,
        ANYROUTER_API_KEY: "",
        ANYROUTER_MODEL: "m/1,m/2,m/3",
      },
      [{ i: 0, title: "Story", source: "hn" }]
    );
    await vi.advanceTimersByTimeAsync(SCORE_CHAT_TIMEOUT_MS);
    await pending;
    const spent = entries
      .filter((entry) => entry.task === "score")
      .reduce((sum, entry) => sum + entry.durationMs, 0);
    expect(spent).toBe(SCORE_CHAT_TIMEOUT_MS);
    expect(spent).toBeLessThan(120_000);
  });
});

/** One SSE token, then silence until abort. A first token clears the 20s
 * cutoff so the attempt runs out the chain budget the score call passed. */
function tokenThenHang(_url: string, init?: RequestInit) {
  const signal = init?.signal;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"{"}}]}\n\n'
        )
      );
      const abort = () => {
        controller.error(
          new DOMException("The operation was aborted.", "AbortError")
        );
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    },
  });
  return new Response(stream, { status: 200 });
}

describe("tldr chain budget", () => {
  // What the first hop really gets, not the cap: modelAttemptTimeoutMs holds
  // back a slice per fallback, which is how a 135s cap became ~100s and
  // timed Laguna (102-119s on the 26K VI prompt) out in production.
  it("gives the configured TL;DR chain's first hop Laguna's worst case", () => {
    const toml = readFileSync(
      fileURLToPath(new URL("../../wrangler.toml", import.meta.url)),
      "utf8"
    );
    const chain = /ANYROUTER_TLDR_MODEL = "([^"]+)"/
      .exec(toml)?.[1]
      ?.split(",");
    expect(chain?.length).toBeGreaterThan(0);
    const firstHop = modelAttemptTimeoutMs(
      tldrAttemptTimeoutMs(TLDR_TIMEOUT_MS, 2),
      chain?.length ?? 0,
      TLDR_SLICE_MAX_MS
    );
    expect(firstHop).toBeGreaterThanOrEqual(125_000);
  });

  // `ingest/context.ts` LLM_STEP timeout, which the tldr step runs inside.
  const LLM_STEP_TIMEOUT_MS = 4 * 60_000;

  // Prod 2026-09-29 08:27 UTC: every anyrouter model returned 502 or hung.
  // Each attempt had its own 240s chain, so the step timed out, the title
  // fallback never ran, and the run stored "tldr step failed".
  it("fits both attempts inside the Workflow step timeout", () => {
    let remaining = TLDR_TIMEOUT_MS;
    let used = 0;
    for (let left = 2; left > 0; left--) {
      const slice = tldrAttemptTimeoutMs(remaining, left);
      used += slice;
      remaining -= slice;
    }
    expect(used).toBeLessThanOrEqual(TLDR_TIMEOUT_MS);
    expect(TLDR_TIMEOUT_MS).toBeLessThan(LLM_STEP_TIMEOUT_MS);
  });

  it("keeps time for the EN-only retry after a hung first attempt", () => {
    const first = tldrAttemptTimeoutMs(TLDR_TIMEOUT_MS, 2);
    expect(tldrAttemptTimeoutMs(TLDR_TIMEOUT_MS - first, 1)).toBe(
      TLDR_RETRY_RESERVE_MS
    );
  });

  it("returns 0 once the shared deadline has passed", () => {
    expect(tldrAttemptTimeoutMs(0, 1)).toBe(0);
    expect(tldrAttemptTimeoutMs(-5, 2)).toBe(0);
  });
});

/** A fetch that never answers and rejects with AbortError once aborted, the
 *  way Workers' fetch behaves when raceTimeout calls abort(). */
function abortingHang(_url: string, init: { signal?: AbortSignal }) {
  return new Promise<never>((_, reject) => {
    init.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError"))
    );
  });
}

// Run ddb11132: every translate/review hop that hit its slice was stored as
// "Provider request failed" / provider_error, which read as an AnyRouter
// outage when it was our own timeout.
describe("timeouts are recorded as timeouts", () => {
  afterEach(() => {
    setLlmCallLogger(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("raceTimeout rejects with the timeout even when abort() rejects the fetch first", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const pending = raceTimeout(
      () => abortingHang("", { signal: abort.signal }),
      1_000,
      "anyrouter model hang/model",
      abort
    );
    const caught = pending.catch((error: Error) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await caught;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out after 1000ms/);
    expect(abort.signal.aborted).toBe(true);
  });

  it("logs an aborted hang as timeout, never provider_error", async () => {
    vi.useFakeTimers();
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(abortingHang));
    const pending = callAnyrouter(
      { ...env, ANYROUTER_MODEL: "hang/model" },
      [{ role: "user", content: "hi" }],
      { timeoutMs: 1_000, json: true }
    ).catch(() => null);
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.error).toBe("anyrouter request timed out");
    // What /api/system/run-attempts shows for the stored error.
    const safe = sanitizeError(entries[0]?.error);
    expect(safe?.code).toBe("timeout");
    expect(safe?.message).toBe("Provider request timed out");
  });

  it("a hanging first translate model leaves every later hop a real slice", async () => {
    vi.useFakeTimers();
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(abortingHang));
    const pending = translateItems(
      {
        ...env,
        ANYROUTER_TRANSLATE_MODEL: "m/1,m/2,m/3,m/4,m/5",
      },
      [{ i: 0, title: "Story A" }]
    );
    // Past TRANSLATE_TIMEOUT_MS: the failed batch is retried until then.
    await vi.advanceTimersByTimeAsync(250_000);
    await pending;
    const hops = entries.filter((e) => e.task === "translate").slice(0, 5);
    expect(hops.map((e) => e.model)).toEqual([
      "m/1",
      "m/2",
      "m/3",
      "m/4",
      "m/5",
    ]);
    for (const hop of hops) {
      expect(sanitizeError(hop.error)?.code, hop.model).toBe("timeout");
    }
    // Translate waits TRANSLATE_FIRST_TOKEN_MS, not the 20s score cap:
    // gemini-3-flash was aborted at 20s with zero tokens. The cap still
    // stops m/1 eating the whole 42s slice. Later hops keep a real slice.
    expect(hops[0]?.durationMs).toBe(TRANSLATE_FIRST_TOKEN_MS);
    expect(hops[0]?.durationMs).toBeLessThan(42_000);
    for (const hop of hops.slice(2)) {
      expect(hop.durationMs, hop.model).toBeGreaterThanOrEqual(5_000);
    }
  });
});

describe("LLM call route", () => {
  afterEach(() => {
    setLlmCallLogger(null);
    vi.unstubAllGlobals();
  });

  it("drops repeated hops so a concrete model is a one-element route", () => {
    expect(
      buildRoute("x/y", { resolved: "x/y", upstream: null, provider: null })
    ).toEqual(["x/y"]);
  });

  // "@preset/aidr" alone says nothing about which model ran; the logged
  // route must name the model the preset resolved to.
  it("logs what a preset resolved to and which provider served it", async () => {
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    const frames = [
      {
        model: "dots/note:free",
        provider: "AtlasCloud",
        choices: [{ delta: { content: '{"ok":true}' } }],
      },
      { model: "dots/note", anyrouter_metadata: { model: "dots/note" } },
    ];
    const body = `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("")}data: [DONE]\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    );
    await callAnyrouter(
      { ...env, ANYROUTER_MODEL: "@preset/aidr" },
      [{ role: "user", content: "hi" }],
      { json: true }
    );
    expect(entries[0]?.route).toEqual([
      "@preset/aidr",
      "dots/note",
      "dots/note:free",
    ]);
    expect(entries[0]?.provider).toBe("AtlasCloud");
  });
});

describe("404 circuit breaker", () => {
  const messages = [{ role: "user" as const, content: "hi" }];
  const ok = () =>
    sseResponse([{ choices: [{ delta: { content: '{"ok":true}' } }] }]);
  const requested = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).model);

  afterEach(() => vi.unstubAllGlobals());

  // Translate runs several batches per step; a 404'd head (missing preset,
  // BYOK-only id) should cost one request per run, not one per batch.
  it("skips an id that 404'd on later calls", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      JSON.parse(String(init.body)).model === "gone/model"
        ? new Response('{"error":{"code":"model_not_found"}}', { status: 404 })
        : ok()
    );
    vi.stubGlobal("fetch", fetchMock);
    const spec = { modelSpec: "gone/model,ok/model", json: true };

    await callAnyrouter(env, messages, spec);
    await callAnyrouter(env, messages, spec);

    expect(requested(fetchMock)).toEqual([
      "gone/model",
      "ok/model",
      "ok/model",
    ]);
  });

  // A rate-limited id also sits out the next batch instead of 429ing again.
  it("skips an id that 429'd on later calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const spec = { modelSpec: "limited/model,ok/model", json: true };

    await callAnyrouter(env, messages, spec);
    await callAnyrouter(env, messages, spec);

    expect(requested(fetchMock)).toEqual([
      "limited/model",
      "ok/model",
      "ok/model",
    ]);
  });

  // 5xx is transient upstream state; the id must stay in the chain.
  it("keeps an id after a transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 502 }))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const spec = { modelSpec: "flaky/model,ok/model", json: true };

    await callAnyrouter(env, messages, spec);
    await callAnyrouter(env, messages, spec);

    expect(requested(fetchMock)).toEqual([
      "flaky/model",
      "ok/model",
      "flaky/model",
    ]);
  });

  // A chain where every id 404'd still sends requests, so a dashboard fix
  // takes effect without waiting out the skip window.
  it("fails open when every id is marked unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("gone", { status: 404 }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const spec = { modelSpec: "only/model", json: true };

    await expect(callAnyrouter(env, messages, spec)).rejects.toThrow(
      /chain exhausted/
    );
    await callAnyrouter(env, messages, spec);

    expect(requested(fetchMock)).toEqual(["only/model", "only/model"]);
  });
});

describe("LLM call id", () => {
  afterEach(() => {
    setLlmCallLogger(null);
    vi.unstubAllGlobals();
  });

  // /data groups a fallback chain by call_id; attempts from one invocation
  // must share it, and separate invocations must never merge.
  it("shares one id across a fallback chain and not across calls", async () => {
    const entries: LlmCallLogEntry[] = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) =>
        JSON.parse(String(init.body)).model === "down/model"
          ? new Response("busy", { status: 502 })
          : sseResponse([{ choices: [{ delta: { content: '{"ok":1}' } }] }])
      )
    );
    const messages = [{ role: "user" as const, content: "hi" }];
    const spec = { modelSpec: "down/model,ok/model", json: true };

    await callAnyrouter(env, messages, spec);
    await callAnyrouter(env, messages, spec);

    const ids = entries.map((entry) => entry.callId);
    expect(entries.map((entry) => entry.model)).toEqual([
      "down/model",
      "ok/model",
      "down/model",
      "ok/model",
    ]);
    expect(ids[0]).toMatch(/^[a-z0-9-]{1,36}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[3]).toBe(ids[2]);
    expect(ids[2]).not.toBe(ids[0]);
  });
});

describe("LLM call cost and request id", () => {
  const messages = [{ role: "user" as const, content: "hi" }];
  let entries: LlmCallLogEntry[];

  beforeEach(() => {
    entries = [];
    setLlmCallLogger((entry) => {
      entries.push(entry);
    });
  });

  afterEach(() => {
    setLlmCallLogger(null);
    vi.unstubAllGlobals();
  });

  // /data shows what each attempt cost; a missing price must read as
  // unknown, never as free.
  it("logs AnyRouter's usage.cost, or null when it is missing", async () => {
    const content = { choices: [{ delta: { content: '{"ok":1}' } }] };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          sseResponse([
            content,
            { usage: { total_tokens: 10, cost: 0.0012, is_byok: false } },
            { anyrouter_metadata: { usage: { totalTokens: 10 } } },
          ])
        )
        .mockResolvedValueOnce(sseResponse([content]))
    );

    await callAnyrouter(env, messages, { modelSpec: "a/model", json: true });
    await callAnyrouter(env, messages, { modelSpec: "a/model", json: true });

    expect(entries.map((entry) => entry.costUsd)).toEqual([0.0012, null]);
  });

  // AnyRouter needs the request id for every failure report, so a non-200
  // attempt keeps the header id; the stream metadata id is the fallback.
  it("keeps the request id on failed attempts and from stream metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("busy", {
            status: 502,
            headers: { "X-Request-ID": "req_abc123" },
          })
        )
        .mockResolvedValueOnce(
          sseResponse([
            { choices: [{ delta: { content: '{"ok":1}' } }] },
            { anyrouter_metadata: { requestId: "req_def456" } },
          ])
        )
    );

    await callAnyrouter(env, messages, {
      modelSpec: "down/model,ok/model",
      json: true,
    });

    expect(entries.map((entry) => entry.requestId)).toEqual([
      "req_abc123",
      "req_def456",
    ]);
  });
});

describe("translateItems draft repair", () => {
  // The seeded open-weight rule (migration 0045), served by a stub D1.
  const ruleRow = {
    id: "seed-open-weight-keep-english",
    kind: "keep_english",
    source_term: "open-weight",
    vi_term: null,
    bad_vi: '["mở trọng lượng"]',
    note: null,
    status: "active",
    hits: 0,
  };
  const withRules: Env = {
    ...env,
    DB: {
      prepare: () => {
        const stmt = {
          bind: () => stmt,
          all: async () => ({ results: [ruleRow] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 0 } }),
        };
        return stmt;
      },
    } as unknown as D1Database,
  };
  const item = { i: 0, title: "Clef releases open-weight decision models" };
  // Prod 2026-10-02 rendering of this headline.
  const draft = "Clef ra mắt các mô hình quyết định mở trọng lượng";
  const rows = (title: string) =>
    chatResponse(JSON.stringify({ results: [{ i: 0, title, summary: "" }] }));

  beforeEach(() => vi.restoreAllMocks());

  it("sends the flagged draft back once with a fix list and keeps the fixed Vietnamese", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rows(draft))
      .mockResolvedValueOnce(
        rows("Clef ra mắt các decision model open-weight")
      );
    vi.stubGlobal("fetch", fetchMock);

    const [out] = await translateItems(withRules, [item]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairPrompt = JSON.parse(fetchMock.mock.calls[1][1].body).messages[1]
      .content as string;
    expect(repairPrompt).toContain('"fix"');
    expect(repairPrompt).toContain("mở trọng lượng");
    expect(out.title).toBe("Clef ra mắt các decision model open-weight");
  });

  // An English echo of the source passes every term check; it must never
  // replace a Vietnamese draft.
  it("keeps the Vietnamese draft when the repair is the English source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rows(draft))
      .mockResolvedValueOnce(rows(item.title));
    vi.stubGlobal("fetch", fetchMock);

    const [out] = await translateItems(withRules, [item]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.title).toBe(draft);
  });

  it("makes no repair call for a clean draft", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        rows("Clef ra mắt các decision model open-weight")
      );
    vi.stubGlobal("fetch", fetchMock);

    await translateItems(withRules, [item]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
