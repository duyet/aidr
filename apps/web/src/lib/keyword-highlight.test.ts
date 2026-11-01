/**
 * The story page colors numbers and names in the title and the AI;DR text so
 * a reader can scan the facts. A wrong highlight is worse than none: a year
 * or a model version in number color reads like a figure, a lowercase topic
 * word in entity color reads like a company, and a span inside a link breaks
 * it. These cases pin both what lights up and what must stay plain.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setLearnedKeywords } from "./highlight";
import { highlightKeywords, numberRanges } from "./keyword-highlight";

function nums(text: string): string[] {
  return numberRanges(text).map((r) => text.slice(r.start, r.end));
}

function marked(text: string, tags: string[] = []): Array<[string, string]> {
  return highlightKeywords(text, tags)
    .filter((s) => s.kind)
    .map((s) => [s.kind as string, s.text]);
}

afterEach(() => setLearnedKeywords([]));

describe("number highlights", () => {
  it("takes Vietnamese money with its scale and currency words", () => {
    expect(
      nums(
        "OpenAI gom được ~11 tỷ USD, định giá 1,25 nghìn tỷ USD, mục tiêu 30 tỷ USD."
      )
    ).toEqual(["~11 tỷ USD", "1,25 nghìn tỷ USD", "30 tỷ USD"]);
  });

  it("takes English money, percentages and multipliers", () => {
    expect(
      nums("It raised $11B at a $1.25 trillion valuation, up 30%, 10x faster.")
    ).toEqual(["$11B", "$1.25 trillion", "30%", "10x"]);
  });

  it("takes an approximate bare number and Vietnamese percent words", () => {
    expect(nums("Khoảng ~11 người, tăng 5 phần trăm")).toEqual([
      "~11",
      "5 phần trăm",
    ]);
  });

  it("leaves years, counts and version digits plain", () => {
    expect(
      nums("In 2026 GPT-5 and Qwen3-235B beat Llama 3 on 8 tests, v1.2.")
    ).toEqual([]);
  });

  it("never highlights inside a URL", () => {
    expect(
      nums("See https://example.com/raise-30%25/$11B and www.x.com/11B now")
    ).toEqual([]);
  });

  it("caps a paragraph at four numbers", () => {
    expect(nums("1% 2% 3% 4% 5% 6%")).toHaveLength(4);
  });

  it("keeps Vietnamese words after a number out of the unit", () => {
    // "tỷ" must end at a letter boundary: "tỷlệ" is not the scale word.
    expect(nums("11 tỷlệ")).toEqual([]);
    expect(nums("11 tỷ đồng")).toEqual(["11 tỷ đồng"]);
  });
});

describe("entity highlights", () => {
  it("marks names from the keyword list and the story's tags", () => {
    expect(
      marked("OpenAI và Anthropic gom được 11 tỷ USD", ["anthropic"])
    ).toEqual([
      ["entity", "OpenAI"],
      ["entity", "Anthropic"],
      ["num", "11 tỷ USD"],
    ]);
  });

  it("skips a topic tag written as a plain lowercase word", () => {
    expect(marked("New funding round for the lab", ["funding"])).toEqual([]);
  });

  it("does not color a name inside a link", () => {
    expect(marked("Read https://openai.com/blog today")).toEqual([]);
  });

  it("joins the segments back to the input text", () => {
    const text =
      "Theo WSJ, OpenAI đạt ~11 tỷ USD (30%) tại https://x.com/a/11B.";
    expect(
      highlightKeywords(text, ["openai"])
        .map((s) => s.text)
        .join("")
    ).toBe(text);
  });
});
