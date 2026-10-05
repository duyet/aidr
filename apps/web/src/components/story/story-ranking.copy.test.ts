import { describe, expect, it } from "vitest";
import { describeTelegramStatus, type StoryRanking } from "./story-ranking";

// Search snippets and the ranking panel must name the 30-minute alarm,
// not the old hourly wording. Email and Telegram clocks are separate gates.
const ranking = {
  dayRank: 1,
  dayTotal: 1,
  rankScore: 1,
  importance: 8,
  bar: 0,
  importanceMin: 6,
  channels: {},
} satisfies StoryRanking;

const pending = { state: "not_posted", reason: "pending" } as const;

describe("pending ranking copy", () => {
  it("names the next 30-minute run in English and Vietnamese", () => {
    expect(describeTelegramStatus("en", pending, ranking, () => "")).toBe(
      "Qualifies; waiting for the next 30-minute run."
    );
    expect(describeTelegramStatus("vi", pending, ranking, () => "")).toBe(
      "Đủ điều kiện; chờ lượt chạy 30 phút tiếp theo."
    );
    expect(
      describeTelegramStatus("en", pending, ranking, () => "")
    ).not.toMatch(/hourly/i);
    expect(
      describeTelegramStatus("vi", pending, ranking, () => "")
    ).not.toMatch(/hàng giờ/);
  });
});
