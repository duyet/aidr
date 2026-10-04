import { describe, expect, it } from "vitest";
import {
  buildTranslationRepairPrompt,
  buildTranslationReviewPrompt,
  ENGLISH_TRANSLATION_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  type TranslationPair,
  type TranslationReview,
} from "../translation-review.js";

const pair: TranslationPair = {
  source: { title: "OpenAI may ship a harness.", summary: "A cap of 10." },
  candidate: {
    title: "OpenAI có thể ra mắt harness.",
    summary: "Giới hạn 10.",
  },
  sourceLang: "en",
  targetLang: "vi",
  direction: "en-vi",
};

describe("translation review rubric", () => {
  it("names the missing terms and fails omission, addition, and a reversed actor", () => {
    const prompt = buildTranslationReviewPrompt(pair);
    for (const term of [
      "decision model",
      "harness",
      "hyperscaler",
      "kill switch",
    ]) {
      expect(prompt).toContain(term);
    }
    expect(prompt).toContain("đại lý");
    expect(prompt).toContain("mô hình quyết định");
    expect(prompt).toContain("mở trọng lượng");
    expect(prompt).toContain("dây chuyền");
    expect(prompt).toContain("cường thị trường");
    expect(prompt).toContain("công tắt");
    expect(prompt).toContain("mất mát huấn luyện");
    expect(prompt).toContain(
      "Fail when a figure, a cap, a paid-only limit, or a stop disappears."
    );
    expect(prompt).toContain(
      "Fail when a patch, a city, a cause, or a number appears that the source does not state."
    );
    expect(prompt).toContain("Fail when the actor is reversed");
    // The trust fence stays a trust fence. The fails live in the rubric.
    expect(REVIEW_SYSTEM_PROMPT).not.toContain("Fail when");
    expect(REVIEW_SYSTEM_PROMPT).not.toContain("decision model");
    expect(ENGLISH_TRANSLATION_SYSTEM_PROMPT).not.toContain("đại lý");
    expect(ENGLISH_TRANSLATION_SYSTEM_PROMPT).toContain(
      "Translate Vietnamese AI/tech news into faithful, natural English"
    );
  });

  it("tells repair not to invent a number or reverse the actor", () => {
    const review = { direction: "en-vi", reason: "actor" } as TranslationReview;
    const prompt = buildTranslationRepairPrompt(pair, review, ["polarity"]);
    expect(prompt).toContain('"countless" is not "hàng triệu"');
    expect(prompt).toContain("Do not reverse the actor");
    expect(prompt).toContain("kill switch");
    expect(prompt).toContain("công tắt");
  });
});
