import { describe, expect, it } from "vitest";
import {
  ENGLISH_TRANSLATION_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
} from "../translation-review.js";

describe("translation review priorities", () => {
  it("puts news fidelity, natural language, and unchanged terms first", () => {
    for (const prompt of [
      REVIEW_SYSTEM_PROMPT,
      ENGLISH_TRANSLATION_SYSTEM_PROMPT,
    ]) {
      expect(prompt).toContain(
        "the news stays faithful (who, what, number, date, polarity, uncertainty)"
      );
      expect(prompt).toContain("technical terms stay unchanged");
      expect(prompt).toMatch(/reads naturally/);
      // English output does not inherit the Vietnamese house style.
      expect(prompt).not.toContain("mã nguồn mở");
      expect(prompt).not.toContain("đại lý");
      expect(prompt).not.toContain("VI_STYLE");
    }
    expect(ENGLISH_TRANSLATION_SYSTEM_PROMPT).toContain(
      "Translate Vietnamese AI/tech news into faithful, natural English"
    );
    expect(ENGLISH_TRANSLATION_SYSTEM_PROMPT).toContain(
      "the English reads naturally"
    );
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      "the target language reads naturally"
    );
  });
});
