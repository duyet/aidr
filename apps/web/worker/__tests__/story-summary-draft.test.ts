/**
 * A Vietnamese caption rewrite gets the draft check its translation got:
 * before this, only `looksVietnamese` judged it, so a rewrite could bring
 * back the calque the translation gate had just refused.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captionSummaryFor,
  OMISSION_ISSUES,
  rewriteIssues,
} from "../notify/story-summary.js";
import { telegramNotifier } from "../notify/telegram.js";
import type { StoryPayload } from "../notify/types.js";
import { translationDraftIssues } from "../translation-draft-check.js";
import type { KnowledgeRule } from "../translation-knowledge.js";
import type { Env } from "../types.js";

const completeJson = vi.hoisted(() => vi.fn());
vi.mock("../llm.js", () => ({ completeJson }));

const FAMILY_RULE: KnowledgeRule = {
  id: "rule-family",
  kind: "avoid",
  source_term: "model family",
  vi_term: "dòng mô hình",
  bad_vi: ["gia đình mô hình"],
  note: null,
  status: "active",
  hits: 0,
};

const SOURCE = {
  title: "Google ships the Gemini 3 model family to developers",
  summary:
    "Google said the Gemini 3 model family is in its API today, in three sizes for coding, search and phones. The largest model leads two coding benchmarks, and the smallest runs on Pixel phones without a network connection. Prices drop by half for the middle size.",
};

/** A Vietnamese summary that reads as source copy ("chúng tôi"), so the
 *  caption asks the model for a rewrite. */
const STORY: StoryPayload = {
  id: "family",
  url: "https://example.test/family",
  title: "Google đưa dòng mô hình Gemini 3 đến nhà phát triển",
  summary:
    "Chúng tôi đưa dòng mô hình Gemini 3 lên API từ hôm nay, với ba kích cỡ cho lập trình, tìm kiếm và điện thoại.",
  translation_source: SOURCE,
  image_url: null,
  category: null,
  points: 0,
  comments: 0,
  rank_score: 10,
  llm_importance: 8,
  lang: "vi",
};

const CLEAN =
  "Google đưa dòng mô hình Gemini 3 lên API từ hôm nay, với ba kích cỡ cho lập trình, tìm kiếm và điện thoại.";
const CALQUE =
  "Google đưa gia đình mô hình Gemini 3 lên API từ hôm nay, với ba kích cỡ cho lập trình, tìm kiếm và điện thoại.";

let cached: { text: string; source_hash: string } | null;
let writes: unknown[][];

const env = {
  DB: {
    prepare: (sql: string) => ({
      all: async () => ({
        results: sql.includes("translation_knowledge")
          ? [{ ...FAMILY_RULE, bad_vi: JSON.stringify(FAMILY_RULE.bad_vi) }]
          : [],
      }),
      bind: (...args: unknown[]) => ({
        first: async () => cached,
        run: async () => {
          writes.push([sql, ...args]);
        },
      }),
    }),
  },
} as unknown as Env;

beforeEach(() => {
  completeJson.mockReset();
  cached = null;
  writes = [];
});

describe("Vietnamese caption rewrite", () => {
  it("drops a rewrite that breaks a knowledge rule", async () => {
    completeJson.mockResolvedValue(JSON.stringify({ summary: CALQUE }));
    expect(await captionSummaryFor(env, STORY, 400)).toBeNull();
    expect(writes).toEqual([]);
  });

  it("keeps a clean rewrite", async () => {
    completeJson.mockResolvedValue(JSON.stringify({ summary: CLEAN }));
    expect(await captionSummaryFor(env, STORY, 400)).toBe(CLEAN);
  });

  it("does not reuse a stored rewrite that breaks a knowledge rule", async () => {
    completeJson.mockResolvedValue(JSON.stringify({ summary: CLEAN }));
    await captionSummaryFor(env, STORY, 400);
    const hash = String(writes[0]?.[3]);
    cached = { text: CALQUE, source_hash: hash };
    completeJson.mockClear();

    expect(await captionSummaryFor(env, STORY, 400)).toBe(CLEAN);
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it("defers, not withholds, a post when the run is out of subrequests", async () => {
    // The chain error carries each model's failure, the runtime's included.
    completeJson.mockRejectedValue(
      new Error("anyrouter chain exhausted: m1: Too many subrequests.")
    );
    const telegramEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_VI_CHAT_ID: "@vi",
    } as Env;
    const send = telegramNotifier.sendStory(telegramEnv, STORY);

    // Thrown, so the dispatcher records `budgetExhausted`: no attempt spent.
    await expect(send).rejects.toThrow(/too many subrequests/i);
  });

  it("does not judge a rewrite by what it leaves out", () => {
    const rewrite = { title: STORY.title, summary: CLEAN };
    // The draft check alone refuses this rewrite for the sentence and the
    // "benchmark" it dropped. If its wording changes, this fails and
    // OMISSION_ISSUES needs updating.
    const issues = translationDraftIssues(SOURCE, rewrite, [], false);
    expect(issues).toHaveLength(OMISSION_ISSUES.length);
    for (const pattern of OMISSION_ISSUES) {
      expect(issues.some((issue) => pattern.test(issue))).toBe(true);
    }
    expect(rewriteIssues(SOURCE, rewrite, [])).toEqual([]);
  });
});
