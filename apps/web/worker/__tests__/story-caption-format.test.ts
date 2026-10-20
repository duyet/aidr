import { describe, expect, it } from "vitest";
import { buildStoryCaption } from "../notify/telegram.js";
import type { StoryPayload } from "../notify/types.js";

const story = (over: Partial<StoryPayload>): StoryPayload => ({
  id: "9b955ce8af2763d0",
  url: "https://example.com/story",
  title: "",
  summary: null,
  image_url: null,
  category: "research",
  points: 0,
  comments: 0,
  rank_score: 1,
  llm_importance: null,
  lang: "en",
  ...over,
});

const withoutTitleMark = (caption: string) => caption.replace("🔥 ", "");

const FIXTURES: Record<string, StoryPayload> = {
  "en: rewritten summary leads with the news and keeps the numbers": story({
    title: "Anthropic raises $30B at a $380B valuation",
    summary:
      "The round was led by GIC and Coatue. Anthropic said run-rate revenue passed $14B.",
    caption_summary:
      "GIC and Coatue led the round. Anthropic said run-rate revenue passed $14B, up from $1B a year ago.",
    points: 812,
    comments: 344,
    category: "funding",
  }),
  "en: summary that only restates the headline is dropped": story({
    title: "Meta delays its next Llama model",
    summary: "Meta delays its next Llama model.",
    points: 120,
    category: "models",
  }),
  "vi: rewritten summary keeps names and numbers": story({
    lang: "vi",
    title: "Anthropic huy động 30 tỷ USD, định giá 380 tỷ USD",
    summary: "Vòng gọi vốn do GIC và Coatue dẫn dắt.",
    caption_summary:
      "GIC và Coatue dẫn dắt vòng gọi vốn. Anthropic cho biết doanh thu quy năm đã vượt 14 tỷ USD, tăng từ 1 tỷ USD một năm trước.",
    points: 812,
    comments: 344,
    category: "funding",
  }),
  "vi: short channel summary fits and stays whole": story({
    lang: "vi",
    title: "Meta hoãn mô hình Llama kế tiếp",
    summary:
      "Meta cho biết mô hình Llama kế tiếp sẽ ra mắt muộn hơn dự kiến vì chất lượng chưa đạt mục tiêu nội bộ.",
    points: 120,
    category: "models",
  }),
};

describe("story caption format", () => {
  it.each(Object.entries(FIXTURES))("%s", (_name, fixture) => {
    const caption = withoutTitleMark(buildStoryCaption(fixture));
    expect(caption).toMatchSnapshot();
    expect(caption.length).toBeLessThanOrEqual(1024);
  });

  it("never repeats the headline in the summary line", () => {
    for (const fixture of Object.values(FIXTURES)) {
      const [title, summary] = withoutTitleMark(
        buildStoryCaption(fixture)
      ).split("\n\n");
      const headline = title.replace(/<\/?b>/g, "");
      expect(summary ?? "").not.toBe(headline);
    }
  });
});
