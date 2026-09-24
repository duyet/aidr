import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectHardSemanticFailures,
  hashTranslationPair,
  inferTranslationDirection,
  parseTranslationReview,
  QA_CONFIDENCE_THRESHOLD,
  QA_CRITERIA_VERSION,
  QA_MAX_REVIEW_CALLS,
  QA_RATING_THRESHOLD,
  ratePendingTranslations,
  resolveIndependentReviewerChain,
  type TranslationDirection,
  type TranslationReview,
} from "../translation-qa.js";
import type { Env } from "../types.js";

const env: Env = {
  DB: {} as D1Database,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.dev/api/v1",
  ANYROUTER_MODEL: "generator/model",
  ANYROUTER_TRANSLATE_MODEL: "generator/model,generator/backup",
  ANYROUTER_REVIEW_MODEL: "reviewer/model,reviewer/backup",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
};

function sseBody(events: unknown[]): string {
  return `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;
}

function completion(content: string, tokens = 0): Response {
  const events: unknown[] = [{ choices: [{ delta: { content } }] }];
  if (tokens > 0) events.push({ usage: { total_tokens: tokens } });
  return new Response(sseBody(events), { status: 200 });
}

interface Row {
  id: string;
  en_title: string;
  en_summary: string | null;
  vi_title: string;
  vi_summary: string;
}

interface ExistingReview {
  item_id: string;
  direction: TranslationDirection;
  source_hash: string;
  candidate_hash: string;
  decision: "accepted" | "repaired" | "human_review" | "review_failed";
}

interface Write {
  sql: string;
  args: unknown[];
}

interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: true; meta: { changes: number } }>;
  write: Write | null;
}

function makeDb(pending: Row[], existing: ExistingReview[] = []) {
  const writes: Write[] = [];
  const db = {
    prepare(sql: string): FakeStatement {
      const statement: FakeStatement = {
        write: null,
        bind(...args: unknown[]) {
          statement.write = { sql, args };
          return statement;
        },
        async all<T>() {
          if (sql.includes("FROM translation_reviews")) {
            return { results: existing as T[] };
          }
          if (sql.includes("FROM translations t")) {
            return { results: pending as T[] };
          }
          return { results: [] };
        },
        async run() {
          if (statement.write) writes.push(statement.write);
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: FakeStatement[]) {
      for (const statement of statements) {
        if (statement.write) writes.push(statement.write);
      }
      return statements.map(() => ({
        success: true,
        meta: { changes: 1 },
      }));
    },
  };
  return { db: db as unknown as D1Database, writes };
}

const passingChecks = {
  entities: "pass",
  numbers: "pass",
  negation: "pass",
  omission: "pass",
  addition: "pass",
  terminology: "pass",
} as const;

function reviewJson(
  direction: TranslationDirection,
  overrides: Record<string, unknown> = {},
  checks: Record<string, string> = {}
): string {
  return JSON.stringify({
    schema_version: 1,
    direction,
    verdict: "accept",
    fidelity: 0.95,
    naturalness: 0.9,
    confidence: 0.9,
    checks: { ...passingChecks, ...checks },
    reason: "faithful and natural",
    ...overrides,
  });
}

const baseRow: Row = {
  id: "item1",
  en_title: "OpenAI launches Model X",
  en_summary: "OpenAI launched Model X with better performance.",
  vi_title: "OpenAI ra mắt Model X",
  vi_summary: "OpenAI đã ra mắt Model X với hiệu suất tốt hơn.",
};

const wrongNumberRow: Row = {
  ...baseRow,
  en_summary: "OpenAI said the event happens in 2024.",
  vi_summary: "OpenAI cho biết sự kiện diễn ra vào năm 2025.",
};

function parsedReview(
  direction: TranslationDirection = "en-vi"
): TranslationReview {
  const parsed = parseTranslationReview(reviewJson(direction), direction);
  if (!parsed) throw new Error("fixture review should be valid");
  return parsed;
}

describe("translation semantic review policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires an explicit reviewer model and never falls back to the generator", async () => {
    const configured = resolveIndependentReviewerChain({
      ANYROUTER_MODEL: "generator/model",
    });
    expect(configured.spec).toBeNull();
    expect(configured.reason).toMatch(/not configured/);

    const { db, writes } = makeDb([baseRow]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({
      ...env,
      ANYROUTER_REVIEW_MODEL: undefined,
      ANYROUTER_QA_MODEL: undefined,
      DB: db,
    });

    expect(stats.calls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("accepts the legacy QA chain only when it is an explicit independent model", () => {
    const resolution = resolveIndependentReviewerChain({
      ANYROUTER_MODEL: "generator/model",
      ANYROUTER_QA_MODEL: "reviewer/model",
    });
    expect(resolution.chain).toEqual(["reviewer/model"]);
    expect(resolution.spec).toBe("reviewer/model");
  });

  it("rejects reviewer ids that overlap any generator fallback", async () => {
    const { db } = makeDb([baseRow]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await ratePendingTranslations({
      ...env,
      ANYROUTER_REVIEW_MODEL: "generator/model",
      DB: db,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strictly rejects malformed, coerced, or alternate review output", () => {
    expect(
      parseTranslationReview(
        '{"schema_version":1,"direction":"en-vi","verdict":"accept"}',
        "en-vi"
      )
    ).toBeNull();
    expect(
      parseTranslationReview(reviewJson("en-vi", { fidelity: "0.95" }), "en-vi")
    ).toBeNull();
    expect(
      parseTranslationReview(reviewJson("en-vi", { extra: true }), "en-vi")
    ).toBeNull();
    expect(parseTranslationReview(reviewJson("en-vi"), "vi-en")).toBeNull();
  });

  it("skips a Vietnamese native passthrough instead of inventing a vi-en pair", () => {
    expect(
      inferTranslationDirection({
        en_title: "OpenAI ra mắt Model X",
        en_summary: "Công ty vừa ra mắt sản phẩm mới.",
        vi_title: "OpenAI ra mắt Model X",
        vi_summary: "Công ty vừa ra mắt sản phẩm mới.",
      })
    ).toBeNull();
  });

  it("detects changed numbers, entities, negation, and every reviewer hard check", () => {
    const review = parsedReview("en-vi");
    const pair = {
      source: {
        title: "OpenAI says Model X is not available in 2024",
        summary: "The launch is confirmed.",
      },
      candidate: {
        title: "Anthropic says Model X is available in 2025",
        summary: "The launch is confirmed.",
      },
    };
    expect(detectHardSemanticFailures(pair, "en-vi", review)).toEqual(
      expect.arrayContaining(["entities", "numbers", "negation"])
    );

    for (const check of ["omission", "addition", "terminology"] as const) {
      const failed = detectHardSemanticFailures(
        {
          source: { title: "OpenAI launches Model X", summary: "A fact." },
          candidate: {
            title: "OpenAI ra mắt Model X",
            summary: "A fact.",
          },
        },
        "en-vi",
        { ...review, checks: { ...review.checks, [check]: "fail" } }
      );
      expect(failed).toContain(check);
    }
  });

  it("documents the thresholds and bounded call/retry policy", () => {
    expect(QA_RATING_THRESHOLD).toBe(0.7);
    expect(QA_CONFIDENCE_THRESHOLD).toBe(0.6);
    expect(QA_MAX_REVIEW_CALLS).toBe(6);
    expect(QA_CRITERIA_VERSION).toBe("translation-semantic-v1");
  });
});

describe("ratePendingTranslations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does nothing when there are no pending rows", async () => {
    const { db, writes } = makeDb([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({ ...env, DB: db });

    expect(stats).toMatchObject({ rated: 0, adjusted: 0, calls: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("reviews EN→VI with the explicit reviewer and persists hashes and provenance", async () => {
    const { db, writes } = makeDb([baseRow]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion(reviewJson("en-vi"), 41));
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({ ...env, DB: db });

    expect(stats).toMatchObject({
      rated: 1,
      accepted: 1,
      adjusted: 0,
      failed: 0,
      calls: 1,
      tokens: 41,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("reviewer/model");
    expect(body.task).toBeUndefined();
    const prompt = body.messages[1].content as string;
    expect(prompt).toContain("English→Vietnamese");
    expect(prompt).toContain("UNTRUSTED DATA");
    expect(prompt).toContain("<untrusted_translation_pair>");

    const reviewWrite = writes.find((write) =>
      write.sql.includes("INSERT INTO translation_reviews")
    );
    const markerWrite = writes.find((write) =>
      write.sql.includes("UPDATE translations SET")
    );
    expect(reviewWrite?.args[0]).toBe("item1");
    expect(reviewWrite?.args[1]).toBe("en-vi");
    expect(reviewWrite?.args[2]).toMatch(/^[a-f0-9]{64}$/);
    expect(reviewWrite?.args[3]).toMatch(/^[a-f0-9]{64}$/);
    expect(reviewWrite?.args[4]).toBe("accepted");
    expect(reviewWrite?.args[10]).toBe("reviewer/model,reviewer/backup");
    expect(reviewWrite?.args[11]).toBe("reviewer/model");
    expect(reviewWrite?.args[13]).toBe(QA_CRITERIA_VERSION);
    expect(reviewWrite?.sql).toContain(
      "attempt_count = translation_reviews.attempt_count + 1"
    );
    expect(markerWrite?.args[2]).toBe(reviewWrite?.args[2]);
    expect(markerWrite?.args[3]).toBe(reviewWrite?.args[3]);
    expect(markerWrite?.sql.split(" WHERE ")[0]).not.toContain("title = ?");
  });

  it("supports the explicit VI→EN cross-check without rewriting the English source", async () => {
    const row: Row = {
      id: "vi-source",
      en_title: "OpenAI ra mắt Model X vào năm 2024",
      en_summary: "Công ty cho biết sự kiện diễn ra năm 2024.",
      vi_title: "OpenAI launched Model X in 2024",
      vi_summary: "The company said the event happens in 2024.",
    };
    expect(inferTranslationDirection(row)).toBe("vi-en");
    const { db, writes } = makeDb([row]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(completion(reviewJson("vi-en"), 12));
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({ ...env, DB: db });

    expect(stats.accepted).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain("Vietnamese→English");
    const marker = writes.find((write) =>
      write.sql.includes("UPDATE translations SET")
    );
    expect(marker?.args[4]).toBe("vi-en");
    expect(marker?.sql.split(" WHERE ")[0]).not.toContain("title = ?");
  });

  it("repairs a hard numeric failure once, re-reviews independently, and atomically applies it", async () => {
    const { db, writes } = makeDb([wrongNumberRow]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion(reviewJson("en-vi"), 10))
      .mockResolvedValueOnce(
        completion(
          JSON.stringify({
            title: "OpenAI cho biết sự kiện sắp diễn ra.",
            summary: "OpenAI cho biết sự kiện diễn ra năm 2024.",
          }),
          20
        )
      )
      .mockResolvedValueOnce(completion(reviewJson("en-vi"), 11));
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({ ...env, DB: db });

    expect(stats).toMatchObject({
      rated: 2,
      adjusted: 1,
      accepted: 1,
      calls: 3,
      tokens: 41,
    });
    expect(
      fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).model)
    ).toEqual(["reviewer/model", "generator/model", "reviewer/model"]);
    const repairPrompt = JSON.parse(fetchMock.mock.calls[1][1].body).messages[1]
      .content as string;
    expect(repairPrompt).toContain("<untrusted_review_metadata>");
    expect(repairPrompt).toContain('"hard_failures":["numbers"]');

    const reviewWrites = writes.filter((write) =>
      write.sql.includes("INSERT INTO translation_reviews")
    );
    expect(reviewWrites.map((write) => write.args[4])).toEqual([
      "repaired",
      "accepted",
    ]);
    const update = writes.find((write) => write.sql.includes("title = ?"));
    expect(update?.args[1]).toContain("2024");
    expect(update?.args[6]).toBe("en-vi");
  });

  it("preserves the original on malformed reviewer output and leaves it retryable", async () => {
    const { db, writes } = makeDb([baseRow]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        completion(
          '{"schema_version":1,"direction":"en-vi","verdict":"accept"}'
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({
      ...env,
      ANYROUTER_REVIEW_MODEL: "reviewer/model",
      DB: db,
    });

    expect(stats).toMatchObject({ failed: 1, calls: 1, adjusted: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain("INSERT INTO translation_reviews");
    expect(writes[0].args[4]).toBe("review_failed");
    expect(
      writes.some((write) => write.sql.includes("UPDATE translations"))
    ).toBe(false);
  });

  it("records a reviewer timeout and preserves the original without repair", async () => {
    vi.useFakeTimers();
    try {
      const { db, writes } = makeDb([baseRow]);
      const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchMock);

      const pending = ratePendingTranslations({
        ...env,
        ANYROUTER_REVIEW_MODEL: "reviewer/model",
        DB: db,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(25_000);
      const stats = await pending;

      expect(stats).toMatchObject({ failed: 1, adjusted: 0, calls: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(writes).toHaveLength(1);
      expect(writes[0].args[4]).toBe("review_failed");
      expect(
        writes.some((write) => write.sql.includes("UPDATE translations"))
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("abstains low-confidence or cross-direction failures to human review", async () => {
    const row: Row = {
      id: "vi-risk",
      en_title: "OpenAI không ra mắt Model X",
      en_summary: "Công ty chưa công bố sản phẩm.",
      vi_title: "OpenAI launches Model X",
      vi_summary: "The company announced the product.",
    };
    const { db, writes } = makeDb([row]);
    const fetchMock = vi.fn().mockResolvedValue(
      completion(
        reviewJson(
          "vi-en",
          {
            verdict: "abstain",
            confidence: 0.4,
            reason: "meaning is uncertain",
          },
          { negation: "fail" }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({ ...env, DB: db });

    expect(stats).toMatchObject({ humanReview: 1, adjusted: 0, calls: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const review = writes.find((write) =>
      write.sql.includes("INSERT INTO translation_reviews")
    );
    expect(review?.args[4]).toBe("human_review");
    expect(review?.args[9]).toMatch(/vi-en mismatch/);
    const marker = writes.find((write) =>
      write.sql.includes("UPDATE translations SET")
    );
    expect(marker?.sql.split(" WHERE ")[0]).not.toContain("title = ?");
  });

  it("does not repeat an unchanged terminal decision but re-reviews changed hashes", async () => {
    const pair = {
      source: { title: baseRow.en_title, summary: baseRow.en_summary ?? "" },
      candidate: { title: baseRow.vi_title, summary: baseRow.vi_summary },
    };
    const hashes = await hashTranslationPair(pair);
    const terminal: ExistingReview = {
      item_id: baseRow.id,
      direction: "en-vi",
      source_hash: hashes.sourceHash,
      candidate_hash: hashes.candidateHash,
      decision: "accepted",
    };
    const { db, writes } = makeDb([baseRow], [terminal]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const first = await ratePendingTranslations({ ...env, DB: db });
    expect(first.calls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);

    const changed: Row = {
      ...baseRow,
      vi_summary: "OpenAI đã ra mắt Model X với hiệu suất cao hơn.",
    };
    const changedDb = makeDb([changed], [terminal]);
    const changedFetch = vi
      .fn()
      .mockResolvedValue(completion(reviewJson("en-vi")));
    vi.stubGlobal("fetch", changedFetch);
    const second = await ratePendingTranslations({
      ...env,
      DB: changedDb.db,
    });

    expect(second.calls).toBe(1);
    expect(changedFetch).toHaveBeenCalledTimes(1);
    expect(changedDb.writes[0].args[3]).not.toBe(terminal.candidate_hash);
  });

  it("caps the whole run at six logical LLM calls and preserves the remainder", async () => {
    const rows = [
      { ...wrongNumberRow, id: "one" },
      { ...wrongNumberRow, id: "two" },
      { ...wrongNumberRow, id: "three" },
    ];
    const { db, writes } = makeDb(rows);
    const fetchMock = vi.fn().mockImplementation(async () => {
      const call = fetchMock.mock.calls.length;
      if (call % 2 === 0) {
        return completion(
          JSON.stringify({
            title: "OpenAI cho biết sự kiện sắp diễn ra.",
            summary: "OpenAI cho biết sự kiện diễn ra năm 2024.",
          })
        );
      }
      return completion(reviewJson("en-vi"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const stats = await ratePendingTranslations({ ...env, DB: db });

    // Six logical calls; one strict-shape miss advances to the bounded
    // reviewer backup, so seven network attempts are still within the policy.
    expect(fetchMock).toHaveBeenCalledTimes(QA_MAX_REVIEW_CALLS + 1);
    expect(stats.calls).toBe(QA_MAX_REVIEW_CALLS);
    expect(stats.adjusted).toBe(2);
    expect(stats.humanReview).toBe(1);
    expect(
      writes.some(
        (write) =>
          write.sql.includes("INSERT INTO translation_reviews") &&
          write.args[4] === "human_review" &&
          write.args[9]?.toString().includes("budget exhausted")
      )
    ).toBe(true);
  });
});
