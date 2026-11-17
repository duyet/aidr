import { describe, expect, it } from "vitest";
import { summaryField, summaryParts, titleParts } from "./story-text";

const item = {
  title: "OpenAI raises money",
  title_vi: "OpenAI gọi vốn",
  summary: "English summary.",
  summary_vi: "Tóm tắt tiếng Việt.",
};
const single = { bilingual: false, first: "vi" } as const;
const both = (first: "vi" | "en") => ({ bilingual: true, first });

describe("titleParts", () => {
  it("shows only the page language when bilingual mode is off", () => {
    expect(titleParts(item, "vi", single)).toEqual([
      { lang: "vi", text: "OpenAI gọi vốn", second: false },
    ]);
    expect(titleParts(item, "en", single)).toEqual([
      { lang: "en", text: "OpenAI raises money", second: false },
    ]);
  });

  it("marks the English fallback on a Vietnamese page as en", () => {
    expect(titleParts({ ...item, title_vi: null }, "vi", single)).toEqual([
      { lang: "en", text: "OpenAI raises money", second: false },
    ]);
  });

  it("stacks both languages with the leading one first and the other second", () => {
    expect(
      titleParts(item, "en", both("vi")).map((p) => [p.lang, p.second])
    ).toEqual([
      ["vi", false],
      ["en", true],
    ]);
    expect(
      titleParts(item, "vi", both("en")).map((p) => [p.lang, p.second])
    ).toEqual([
      ["en", false],
      ["vi", true],
    ]);
  });

  it("never fills a missing column from the other language", () => {
    expect(titleParts({ ...item, title_vi: null }, "vi", both("vi"))).toEqual([
      { lang: "en", text: "OpenAI raises money", second: false },
    ]);
    expect(titleParts({ ...item, title_vi: "  " }, "en", both("vi"))).toEqual([
      { lang: "en", text: "OpenAI raises money", second: false },
    ]);
  });
});

describe("summaryParts", () => {
  it("shows the Vietnamese summary on a Vietnamese page and falls back to English, marked en", () => {
    expect(summaryParts(item, "vi", single)[0]).toMatchObject({ lang: "vi" });
    expect(summaryParts({ ...item, summary_vi: null }, "vi", single)).toEqual([
      { lang: "en", text: "English summary.", second: false },
    ]);
  });

  it("shows both columns in bilingual mode and nothing for an empty story", () => {
    expect(summaryParts(item, "en", both("en")).map((p) => p.lang)).toEqual([
      "en",
      "vi",
    ]);
    expect(
      summaryParts({ summary: null, summary_vi: null }, "vi", both("vi"))
    ).toEqual([]);
  });
});

describe("summaryField", () => {
  it("targets the only text on screen, or the Vietnamese column of two", () => {
    const [vi, en] = summaryParts(item, "vi", both("vi"));
    expect(summaryField(vi, true)).toBe("summary");
    expect(summaryField(en, true)).toBeUndefined();
    expect(summaryField(en, false)).toBe("summary");
  });
});
