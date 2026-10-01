import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clusterSimilar, MAX_NEW_ITEMS_IN_CLUSTER_PROMPT } from "../dedupe.js";
import {
  JEV_PANEL_MAX_DEBATE_ROUNDS,
  JEV_PANEL_MAX_JUDGES,
} from "../jev-panel/core.js";
import {
  JEV_PANEL_MAX_ITEMS_PER_STEP,
  resetJevScoreReviewMemo,
  reviewScoredItemsWithJevPanel,
} from "../jev-panel/score-review.js";
import {
  generateTldr,
  scoreItems,
  TRANSLATE_BATCH_SIZE,
  translateItems,
} from "../llm.js";
import {
  DIGEST_MAX_BULLETS,
  NOTIFY_MAX_ATTEMPTS,
  TRENDING_BURST_MAX_PER_DAY,
  TRENDING_BURST_MIN_GAP_SEC,
  trendingBudget,
} from "../notify/index.js";
import { storyPhotoUrls } from "../notify/telegram.js";
import type { StoryPayload } from "../notify/types.js";
import {
  planVideoDelivery,
  TELEGRAM_ALBUM_MAX_ITEMS,
} from "../notify/video.js";
import {
  reviewPendingSubmissions,
  REVIEW_CAP_DEFAULT as SUBMISSION_REVIEW_CAP,
} from "../submissions.js";
import {
  reviewPendingSuggestions,
  REVIEW_CAP_DEFAULT as SUGGESTION_REVIEW_CAP,
} from "../suggestions.js";
import {
  MAX_EXISTING_CANONICALS_IN_PROMPT,
  MAX_TAGS_PER_ITEM,
  MAX_UNSEEN_TOPICS_IN_PROMPT,
  normalizeTopics,
} from "../topics.js";
import { ratePendingTranslations } from "../translation-qa.js";
import { QA_MAX_CALLS } from "../translation-review.js";
import type { Env } from "../types.js";

/**
 * Hard caps on paid or externally visible calls per run (#147). Each test
 * fails if a change makes one run fan out further: LLM spend and Telegram
 * posts are the two places a bug turns into money or channel spam.
 */

const env: Env = {
  DB: {} as D1Database,
  NEWS_INGEST: {} as Workflow,
  ANYROUTER_BASE_URL: "https://anyrouter.test/api/v1",
  ANYROUTER_MODEL: "test-model",
  ANYROUTER_API_KEY: "test-key",
  NEWS_ADMIN_TOKEN: "test-token",
};

function chat(content: string): Response {
  const frame = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  return new Response(
    `${frame({ choices: [{ delta: { content } }] })}data: [DONE]\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LLM call caps per run", () => {
  const scoreItemsList = Array.from({ length: 12 }, (_, i) => ({
    i,
    title: `t${i}`,
    source: "s",
  }));

  it("scores in batches of 5: exactly one call per batch when the model answers", async () => {
    const fetchMock = vi.fn(async (url: unknown, init: unknown) => {
      if (String(url).includes("/systemone")) {
        return new Response("down", { status: 500 });
      }
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      const prompt = body.messages.map((m) => m.content).join("\n");
      const ids = [...prompt.matchAll(/\{"i":(\d+),"title"/g)].map((m) =>
        Number(m[1])
      );
      return chat(
        JSON.stringify({
          results: ids.map((i) => ({
            i,
            relevance: 0.9,
            importance: 5,
            quality: 5,
            category: "Models",
            tags: ["a", "b", "c"],
          })),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await scoreItems(env, scoreItemsList);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // System One is tried once per item, then chat once per batch of 5.
    expect(urls.filter((u) => u.includes("/systemone"))).toHaveLength(12);
    expect(urls.filter((u) => !u.includes("/systemone"))).toHaveLength(3);
  });

  it("bounds score retries when the model never answers usefully", async () => {
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes("/systemone")
        ? new Response("down", { status: 500 })
        : chat('{"results":[]}')
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await scoreItems(env, scoreItemsList);
    const chatCalls = fetchMock.mock.calls.filter(
      (c) => !String(c[0]).includes("/systemone")
    );
    // 3 batches x at most 5 attempts each; never a per-item chat fan-out.
    expect(chatCalls.length).toBeLessThanOrEqual(3 * 5);
  });

  it("translates in batches of TRANSLATE_BATCH_SIZE", async () => {
    const fetchMock = vi.fn(async (_u: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      const prompt = body.messages.map((m) => m.content).join("\n");
      const ids = [...prompt.matchAll(/"i":(\d+)/g)].map((m) => Number(m[1]));
      return chat(
        JSON.stringify({
          results: ids.map((i) => ({ i, title: `vi${i}`, summary: "x" })),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const items = Array.from({ length: 7 }, (_, i) => ({
      i,
      title: `t${i}`,
      summary: "s",
      sourceLang: "en" as const,
    }));
    await translateItems(env, items);
    expect(fetchMock).toHaveBeenCalledTimes(
      Math.ceil(items.length / TRANSLATE_BATCH_SIZE)
    );
  });

  it("does not call the model for Vietnamese-source items", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await translateItems(env, [
      { i: 0, title: "tin", summary: "s", sourceLang: "vi" as const },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up on the TL;DR after two attempts", async () => {
    const fetchMock = vi.fn(async () => chat("no json"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await generateTldr(env, [{ id: "1", title: "Story" }]);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result.error).toBeTruthy();
  });
});

describe("Telegram caps per run", () => {
  it("pins the digest and retry ceilings", () => {
    expect(DIGEST_MAX_BULLETS).toBe(8);
    expect(NOTIFY_MAX_ATTEMPTS).toBe(3);
    expect(TRENDING_BURST_MAX_PER_DAY).toBe(6);
    expect(TELEGRAM_ALBUM_MAX_ITEMS).toBe(10);
  });

  it("allows at most one trending post per run", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(trendingBudget(0, null, now)).toBe(1);
  });

  it("stops trending posts at the daily cap", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(trendingBudget(TRENDING_BURST_MAX_PER_DAY, null, now)).toBe(0);
  });

  it("respects the minimum gap between posts", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const recent = now - (TRENDING_BURST_MIN_GAP_SEC - 1) * 1000;
    expect(trendingBudget(1, recent, now)).toBe(0);
  });

  const story = (assets: unknown[]) =>
    ({
      id: "abcdef1234567890",
      url: "https://example.com/story",
      title: "T",
      summary: "S",
      image_url: null,
      category: "llm",
      points: 0,
      comments: 0,
      rank_score: 1,
      llm_importance: 9,
      lang: "vi",
      media_manifest: { version: 1, assets },
    }) as StoryPayload;

  it("caps a photo album at the Telegram limit", () => {
    const assets = Array.from({ length: 25 }, (_, i) => ({
      type: "image",
      url: `https://img.example/${i}.jpg`,
    }));
    expect(storyPhotoUrls(story(assets)).length).toBeLessThanOrEqual(
      TELEGRAM_ALBUM_MAX_ITEMS
    );
  });

  it("probes at most 3 videos and posts nothing while planning", async () => {
    const fetchMock = vi.fn(
      async (_url: unknown) => new Response("nope", { status: 404 })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const assets = Array.from({ length: 8 }, (_, i) => ({
      type: "video",
      url: `https://cdn.example/clip${i}.mp4`,
    }));
    await planVideoDelivery(story(assets));
    const origins = new Set(
      fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname)
    );
    expect(origins.size).toBeLessThanOrEqual(3);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("api.telegram.org");
    }
  });
});

/** Fake D1 for the review loops: serves `rows` for the pending-queue query
 *  and honors its `LIMIT n`, so an oversized queue only yields the cap. */
function reviewQueueDb(
  queueTable: string,
  rows: unknown[],
  first: (sql: string) => unknown = () => null
): D1Database {
  return {
    prepare(sql: string) {
      const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? rows.length);
      const bound = () => ({
        all: async () => ({
          results: sql.includes(`FROM ${queueTable}`)
            ? rows.slice(0, limit)
            : [],
        }),
        first: async () => first(sql),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      });
      return { ...bound(), bind: () => bound() };
    },
    batch: async (statements: unknown[]) =>
      statements.map(() => ({ success: true })),
  } as unknown as D1Database;
}

describe("review LLM caps per run", () => {
  const modelCalls = (mock: ReturnType<typeof vi.fn>) =>
    mock.mock.calls.filter((c) => String(c[0]).includes("anyrouter.test"));

  it("reviews at most REVIEW_CAP_DEFAULT submissions, at most 2 model calls each", async () => {
    const pending = Array.from(
      { length: 4 * SUBMISSION_REVIEW_CAP },
      (_, i) => ({
        id: `sub${i}`,
        url: `https://example.com/story-${i}`,
        title: `Story ${i} about a model`,
        note: null,
      })
    );
    const fetchMock = vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target.includes("/systemone")) {
        return new Response("down", { status: 500 });
      }
      if (target.includes("anyrouter.test")) {
        return chat(JSON.stringify({ relevance: 0.9, note: "genuine" }));
      }
      return new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const stats = await reviewPendingSubmissions({
      ...env,
      DB: reviewQueueDb("submissions", pending),
    });
    // The queue is 4x the cap; the run must reach the cap, not pass empty.
    expect(stats.reviewed).toBe(SUBMISSION_REVIEW_CAP);
    // Per submission: one System One try, then one chat call.
    expect(modelCalls(fetchMock).length).toBeLessThanOrEqual(
      SUBMISSION_REVIEW_CAP * 2
    );
  });

  it("reviews at most REVIEW_CAP_DEFAULT suggestions; at most review + rewrite calls each", async () => {
    const pending = Array.from(
      { length: 4 * SUGGESTION_REVIEW_CAP },
      (_, i) => ({
        id: `s${i}`,
        item_id: `item${i}`,
        field: "title",
        suggestion: `Tiêu đề ${i}`,
      })
    );
    const fetchMock = vi.fn(async (url: unknown, init: unknown) => {
      if (String(url).includes("/systemone")) {
        return new Response("down", { status: 500 });
      }
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      const prompt = body.messages.map((m) => m.content).join("\n");
      // Review prompt: accept every suggestion, so each one is also rewritten.
      if (prompt.includes("READER-SUBMITTED, UNTRUSTED DATA")) {
        const ids = [...prompt.matchAll(/"id":"(s\d+)"/g)].map((m) => m[1]);
        return chat(
          JSON.stringify({
            results: ids.map((id) => ({
              id,
              valid: true,
              rating: 1,
              note: "ok",
            })),
          })
        );
      }
      return chat(JSON.stringify({ translation: "Bản dịch" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = reviewQueueDb("translation_suggestions", pending, (sql) =>
      sql.includes("FROM translation_suggestions")
        ? { ...pending[0], lang: "vi" }
        : sql.includes("FROM items")
          ? { title: "Title", summary: "Summary", source_lang: "en" }
          : sql.includes("FROM translations")
            ? { title: "Tiêu đề", summary: "Tóm tắt" }
            : null
    );
    await reviewPendingSuggestions({ ...env, DB: db });
    // Per suggestion: System One try, chat review, chat rewrite, and one
    // rule-extraction call after an accept.
    expect(modelCalls(fetchMock).length).toBeGreaterThan(SUGGESTION_REVIEW_CAP);
    expect(modelCalls(fetchMock).length).toBeLessThanOrEqual(
      SUGGESTION_REVIEW_CAP * 4
    );
  });
});

describe("translation QA caps per run", () => {
  const migration = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../migrations/0023_translation_reviews.sql"
    ),
    "utf8"
  );

  /** Minimal D1 over node:sqlite; same shape as translation-qa.integration. */
  function sqliteD1(sqlite: DatabaseSync) {
    type Input = null | number | bigint | string | NodeJS.ArrayBufferView;
    return {
      prepare(sql: string) {
        const statement = sqlite.prepare(sql);
        let args: Input[] = [];
        const prepared = {
          bind: (...next: unknown[]) => {
            args = next as Input[];
            return prepared;
          },
          all: async () => ({ results: statement.all(...args) as unknown[] }),
          first: async () => statement.get(...args) ?? null,
          run: async () => ({
            success: true,
            meta: { changes: Number(statement.run(...args).changes) },
          }),
        };
        return prepared;
      },
      async batch(statements: Array<{ run: () => Promise<unknown> }>) {
        const out: unknown[] = [];
        for (const statement of statements) out.push(await statement.run());
        return out;
      },
    } as unknown as D1Database;
  }

  it("makes at most QA_MAX_CALLS model calls however many translations wait", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE items (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT,
          status TEXT NOT NULL DEFAULT 'published',
          published_at INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE translations (
          item_id TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'vi',
          title TEXT, summary TEXT, qa_rating REAL, qa_at INTEGER,
          PRIMARY KEY (item_id, lang)
        );
      `);
      for (let i = 0; i < 4 * QA_MAX_CALLS; i++) {
        sqlite.exec(`
          INSERT INTO items (id, title, summary)
          VALUES ('item-${i}', 'Model ${i} ships', 'Released 2024-05-01.');
          INSERT INTO translations (item_id, lang, title, summary)
          VALUES ('item-${i}', 'vi', 'Mo hinh ${i} ra mat', 'Ngay 2024-05-01.');
        `);
      }
      sqlite.exec(migration);
      const fetchMock = vi.fn(async () => chat("not-json"));
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
      const stats = await ratePendingTranslations({
        ...env,
        DB: sqliteD1(sqlite),
        ANYROUTER_REVIEW_MODEL: "reviewer/model",
      });
      expect(stats.calls).toBe(QA_MAX_CALLS);
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(QA_MAX_CALLS);
    } finally {
      sqlite.close();
    }
  });
});

describe("JEV panel caps per run", () => {
  const judge = (vote: string, score: number) =>
    JSON.stringify({
      vote,
      confidence: 0.8,
      score,
      category: "Models",
      claims: [
        {
          id: "c1",
          text: "A claim.",
          evidence: [{ sourceId: "vendor", locator: "https://example.test/a" }],
        },
      ],
      rationale: "r",
    });

  it("spends at most judges x (1 + debate rounds) calls per item, however many items", async () => {
    resetJevScoreReviewMemo();
    // Three seats, one model each, and the judges always disagree so the
    // debate round runs for every item: the worst case for call count.
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
      };
      const vote = body.model.startsWith("anthropic/") ? "oppose" : "support";
      return chat(judge(vote, 0.1));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `item-${i}`,
      title: `Story ${i}`,
      summary: "s",
      source: "vendor",
    }));
    const seats = 3;
    await reviewScoredItemsWithJevPanel(
      {
        ...env,
        JEV_PANEL_ENABLED: "1",
        JEV_PANEL_DEBATE: "1",
        JEV_PANEL_RELEVANCE_MODEL: "openai/gpt-5.2",
        JEV_PANEL_SOURCE_QUALITY_MODEL: "anthropic/claude-opus-4-5",
        JEV_PANEL_SAFETY_MODEL: "google/gemini-3-pro",
      },
      {
        items,
        relevanceById: new Map(items.map((it) => [it.id, 0.9])),
        categoryOptions: ["Models"],
      }
    );
    expect(seats).toBeLessThanOrEqual(JEV_PANEL_MAX_JUDGES);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(
      items.length * seats * (1 + JEV_PANEL_MAX_DEBATE_ROUNDS)
    );
    // The bound is reached, not just respected: debate did run.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(items.length * seats);
    resetJevScoreReviewMemo();
  });

  it("sends at most JEV_PANEL_MAX_ITEMS_PER_STEP items to the panel; the rest keep the primary score", async () => {
    // Why: every panel item costs up to seats x 2 paid judge calls, and
    // nothing upstream bounds how many new items one run scores (a source
    // without maxItems, or a backlog of status='new' rows). The step timeout
    // bounds time, not calls: judges that answer fast are never stopped by it.
    resetJevScoreReviewMemo();
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        model: string;
      };
      const vote = body.model.startsWith("anthropic/") ? "oppose" : "support";
      return chat(judge(vote, 0.1));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const items = Array.from(
      { length: 3 * JEV_PANEL_MAX_ITEMS_PER_STEP },
      (_, i) => ({
        id: `item-${i}`,
        title: `Story ${i}`,
        summary: "s",
        source: "vendor",
      })
    );
    // A scoring panel seats at most three judges: relevance, source quality
    // and the optional safety judge. One model per seat, so one fetch per
    // judge call; a longer fallback chain would multiply fetches, not calls.
    const seats = 3;
    const { outcomes } = await reviewScoredItemsWithJevPanel(
      {
        ...env,
        JEV_PANEL_ENABLED: "1",
        JEV_PANEL_DEBATE: "1",
        JEV_PANEL_RELEVANCE_MODEL: "openai/gpt-5.2",
        JEV_PANEL_SOURCE_QUALITY_MODEL: "anthropic/claude-opus-4-5",
        JEV_PANEL_SAFETY_MODEL: "google/gemini-3-pro",
      },
      {
        items,
        relevanceById: new Map(items.map((it) => [it.id, 0.9])),
        categoryOptions: ["Models"],
      }
    );
    // The first N in input order are reviewed. Items past the cap have no
    // outcome, which scoreItems reads as "keep the primary row": they are
    // neither dropped nor demoted.
    expect([...outcomes.keys()]).toEqual(
      items.slice(0, JEV_PANEL_MAX_ITEMS_PER_STEP).map((it) => it.id)
    );
    const worstCasePerStep =
      JEV_PANEL_MAX_ITEMS_PER_STEP * seats * (1 + JEV_PANEL_MAX_DEBATE_ROUNDS);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(worstCasePerStep);
    // The bound is reached: debate ran for the capped items.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(
      JEV_PANEL_MAX_ITEMS_PER_STEP * seats
    );
    // An hourly run scores in two steps (score, backfill-score), so the
    // scoring panel's worst case per run is 2 x 10 items x 3 seats x 2
    // rounds = 120 calls. The submission and suggestion gates are bounded
    // by their own review caps, tested above.
    expect(JEV_PANEL_MAX_ITEMS_PER_STEP).toBe(10);
    expect(2 * worstCasePerStep).toBe(120);
    resetJevScoreReviewMemo();
  });
});

describe("dedupe and topics caps per run", () => {
  it("clusters with exactly one call, however many items are new", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"clusters":[]}' } }],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await clusterSimilar(
      env,
      Array.from({ length: 500 }, (_, i) => ({ i, title: `new ${i}` })),
      Array.from({ length: 300 }, (_, i) => ({
        id: `e${i}`,
        title: `old ${i}`,
      }))
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the clustering model at most MAX_NEW_ITEMS_IN_CLUSTER_PROMPT new items; the rest are not clustered", async () => {
    // Why: nothing upstream bounds new items per run, and every one adds a
    // title and URL to a single prompt. Past the model's context the call
    // fails and the run loses all LLM clustering, so the prompt must stop
    // growing. An item that was not shown must also not be merged on the
    // model's say-so.
    const cap = MAX_NEW_ITEMS_IN_CLUSTER_PROMPT;
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      bodies.push((init as { body: string }).body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  clusters: [
                    { new: [cap - 2, cap - 1] }, // last two shown items
                    { new: [cap, cap + 1] }, // both past the cap
                    { new: [cap + 2], existing: ["e0"] }, // one past the cap
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const clusters = await clusterSimilar(
      env,
      Array.from({ length: cap + 50 }, (_, i) => ({ i, title: `new ${i}` })),
      [{ id: "e0", title: "old 0" }]
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const prompt = (
      JSON.parse(bodies[0]) as { messages: { content: string }[] }
    ).messages[0].content;
    const shown = JSON.parse(
      /New items[^\n]*\n(\[.*\])/.exec(prompt)?.[1] ?? "[]"
    ) as { i: number }[];
    // Input order, first N: no ordering by duplicate likelihood exists.
    expect(shown.map((item) => item.i)).toEqual(
      Array.from({ length: cap }, (_, i) => i)
    );
    // Below the cap clustering is unchanged; overflow items stay on their own.
    expect(clusters).toEqual([{ new: [cap - 2, cap - 1], existing: [] }]);
    expect(cap).toBe(100);
  });

  it("maps unseen topics with one call, and shows at most 150 existing canonicals", async () => {
    const prompts: string[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      prompts.push(body.messages.map((m) => m.content).join("\n"));
      return chat('{"mappings":[]}');
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const existing = Array.from({ length: 400 }, (_, i) => ({
      name: `known-${i}`,
      canonical: `known-${i}`,
    }));
    const db = {
      prepare: () => ({
        all: async () => ({ results: existing }),
        bind: () => ({}),
      }),
      batch: async () => [],
    } as unknown as D1Database;
    const tags = new Map(
      Array.from({ length: 200 }, (_, i) => [`item-${i}`, [`fresh-tag-${i}a`]])
    );
    await normalizeTopics({ ...env, DB: db }, tags, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const shown = /Existing canonical topics[^\n]*\n(\[.*\])/.exec(prompts[0]);
    expect(
      (JSON.parse(shown?.[1] ?? "[]") as string[]).length
    ).toBeLessThanOrEqual(MAX_EXISTING_CANONICALS_IN_PROMPT);
  });

  it("asks about at most MAX_UNSEEN_TOPICS_IN_PROMPT unseen tags; the rest become their own canonical", async () => {
    // Why: unseen tags grow with items x MAX_TAGS_PER_ITEM and the answer has
    // one mapping object per tag. An answer cut off at max_tokens does not
    // parse, and then every tag of the run loses its mapping.
    const cap = MAX_UNSEEN_TOPICS_IN_PROMPT;
    // The cap still covers a full scoring step of 15 items.
    expect(cap).toBeGreaterThanOrEqual(15 * MAX_TAGS_PER_ITEM);
    const prompts: string[] = [];
    const fetchMock = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        messages: { content: string }[];
      };
      prompts.push(body.messages.map((m) => m.content).join("\n"));
      return chat(
        JSON.stringify({
          mappings: [
            { name: "fresh-0", canonical: "llm" }, // asked: mapping applies
            { name: `fresh-${cap}`, canonical: "llm" }, // not asked: ignored
          ],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const db = {
      prepare: () => ({
        all: async () => ({ results: [{ name: "llm", canonical: "llm" }] }),
        bind: () => ({}),
      }),
      batch: async () => [],
    } as unknown as D1Database;
    const tags = new Map(
      Array.from({ length: cap + 40 }, (_, i) => [`item-${i}`, [`fresh-${i}`]])
    );
    const canonical = await normalizeTopics({ ...env, DB: db }, tags, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const asked = JSON.parse(
      /New candidates:\n(\[.*\])/.exec(prompts[0])?.[1] ?? "[]"
    ) as string[];
    expect(asked).toEqual(Array.from({ length: cap }, (_, i) => `fresh-${i}`));
    // Below the cap mapping is unchanged.
    expect(canonical.get("item-0")).toEqual(["llm"]);
    expect(canonical.get(`item-${cap - 1}`)).toEqual([`fresh-${cap - 1}`]);
    // Past the cap: identity, even when the model names the tag anyway.
    expect(canonical.get(`item-${cap}`)).toEqual([`fresh-${cap}`]);
    expect(canonical.get(`item-${cap + 39}`)).toEqual([`fresh-${cap + 39}`]);
    expect(cap).toBe(100);
  });
});
