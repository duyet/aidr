import { describe, expect, it } from "vitest";
import { storySummaries, storyTitles } from "./row-text";

const single = { bilingual: false, bilingualFirst: "vi" } as const;
const both = (bilingualFirst: "vi" | "en") =>
  ({ bilingual: true, bilingualFirst }) as const;

describe("storyTitles", () => {
  const item = { title: "OpenAI ships a model", title_vi: "OpenAI ra mô hình" };

  it("gives one language in the single view", () => {
    expect(storyTitles(item, "en", single)).toEqual([
      { lang: "en", text: "OpenAI ships a model", fallbackFromEnglish: false },
    ]);
    expect(storyTitles(item, "vi", single)).toEqual([
      { lang: "vi", text: "OpenAI ra mô hình", fallbackFromEnglish: false },
    ]);
  });

  it("keeps the labelled English fallback in the Vietnamese single view", () => {
    expect(storyTitles({ ...item, title_vi: null }, "vi", single)).toEqual([
      { lang: "vi", text: "OpenAI ships a model", fallbackFromEnglish: true },
    ]);
  });

  it("leads with the chosen language in the bilingual view", () => {
    expect(storyTitles(item, "vi", both("vi")).map((t) => t.lang)).toEqual([
      "vi",
      "en",
    ]);
    expect(storyTitles(item, "vi", both("en")).map((t) => t.lang)).toEqual([
      "en",
      "vi",
    ]);
  });

  it("never fills the Vietnamese line with the English title", () => {
    expect(storyTitles({ ...item, title_vi: null }, "vi", both("vi"))).toEqual([
      { lang: "en", text: "OpenAI ships a model" },
    ]);
  });

  it("shows a title once when the English column already holds Vietnamese", () => {
    const viInTitle = { title: "OpenAI ra mô hình mới", title_vi: null };
    expect(storyTitles(viInTitle, "vi", both("vi"))).toEqual([
      { lang: "vi", text: "OpenAI ra mô hình mới" },
    ]);
  });
});

describe("storySummaries", () => {
  const item = { summary: "English body", summary_vi: "Nội dung tiếng Việt" };

  it("reads each language from its own column", () => {
    expect(storySummaries(item, "en", single)).toEqual([
      { lang: "en", text: "English body" },
    ]);
    expect(storySummaries(item, "vi", single)).toEqual([
      { lang: "vi", text: "Nội dung tiếng Việt" },
    ]);
    expect(storySummaries(item, "en", both("vi")).map((s) => s.lang)).toEqual([
      "vi",
      "en",
    ]);
  });

  it("returns nothing for a language with no summary, never the other one", () => {
    expect(
      storySummaries(
        { summary: "English body", summary_vi: null },
        "vi",
        single
      )
    ).toEqual([]);
    expect(
      storySummaries(
        { summary: "English body", summary_vi: "  " },
        "vi",
        both("vi")
      )
    ).toEqual([{ lang: "en", text: "English body" }]);
  });
});
