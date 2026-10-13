import { describe, expect, it } from "vitest";
import {
  firstSentence,
  lastSentenceEnd,
  splitSentences,
} from "../sentences.js";
import { clipFeedSummary } from "../sources/rss.js";

/** Fragments from stored summaries and digest bullets that the old splitters
 *  cut in the middle. Each is one sentence. */
const ONE_SENTENCE = [
  "UPDATE: Claude Opus 5.5 Debuts at No. 2 in Agent Arena at 64% Lower Cost Per Task",
  "ElevenLabs Eleven v4 Takes No. 1 Voice AI Rank With Pronunciation Record",
  "GPT-6 Astra Seizes No. 1 on Code Arena WebDev With 35% Fewer Tokens",
  "Meta's Muse Spark 1.3 climbed to No. 8 on the Vals Index, making it the top open model.",
  "Microsoft’s shares rose on Oct. 12 as Azure growth hit 43% and the stock closed higher.",
  "Anthropic will ban cruelty toward Claude from Nov. 12, using the same conversation-ending tool.",
  "An Nvidia RTX Spark chip sold out before its Oct. 16 ship date.",
  "The legislative support follows OpenAI’s Sept. 12 commitment to give independent access.",
  "The full lockup expires by Nov. 9.",
  "UPDATE: OpenAI Agents Browsed U.S. Government Websites as Weeks of Warning Signs Went Unheeded",
  "The U.S. DOJ filed a brief supporting OpenAI in the case.",
  "Anthropic's Quest to Instill Morality into Its A.I. Models",
  "Shares of Acme Inc. and Globex Corp. rose after the report.",
  "Mr. Smith met Dr. Jones at St. Louis General Hospital.",
  "Agents Tried to Fill Out Visa Forms on State Dept. Websites",
  "Open models vs. closed ones, e.g. Llama and Claude, are close on this benchmark.",
  "Version v1.2 shipped with 2.5x faster decoding.",
  "Khoản đầu tư 1.000 tỷ đồng được công bố ngày 12/10.",
  "Hãng chốt thỏa thuận tại No. 5 Nguyễn Huệ vào ngày 30 tháng 9.",
];

describe("splitSentences abbreviations", () => {
  it.each(ONE_SENTENCE)("keeps one sentence: %s", (text) => {
    expect(splitSentences(text)).toEqual([text]);
  });

  it("splits after a month abbreviation that ends a sentence", () => {
    expect(
      splitSentences("The vote is due in Oct. The result follows.")
    ).toEqual(["The vote is due in Oct.", "The result follows."]);
  });

  it("splits after a company suffix that ends a sentence", () => {
    expect(
      splitSentences("It was sold by Acme Inc. The price was not disclosed.")
    ).toEqual(["It was sold by Acme Inc.", "The price was not disclosed."]);
  });
});

describe("splitSentences ordinary text", () => {
  it("splits two sentences", () => {
    expect(splitSentences("OpenAI shipped a model. It is faster.")).toEqual([
      "OpenAI shipped a model.",
      "It is faster.",
    ]);
  });

  it("splits on ? and !", () => {
    expect(splitSentences("Is it real? Yes! It ships today.")).toEqual([
      "Is it real?",
      "Yes!",
      "It ships today.",
    ]);
  });

  it("keeps a closing quote with its sentence", () => {
    expect(splitSentences('He said "it works." Nobody disagreed.')).toEqual([
      'He said "it works."',
      "Nobody disagreed.",
    ]);
  });

  it("splits Vietnamese sentences", () => {
    expect(
      splitSentences(
        "Google ra mắt mô hình mới. Sản phẩm hướng đến doanh nghiệp."
      )
    ).toEqual([
      "Google ra mắt mô hình mới.",
      "Sản phẩm hướng đến doanh nghiệp.",
    ]);
  });

  it("splits when the next sentence starts with a digit", () => {
    expect(splitSentences("Revenue rose 5%. 2026 looks strong.")).toEqual([
      "Revenue rose 5%.",
      "2026 looks strong.",
    ]);
  });

  it("returns [] for blank text", () => {
    expect(splitSentences("  ")).toEqual([]);
  });
});

describe("firstSentence", () => {
  it("returns the first whole sentence past an abbreviation", () => {
    expect(
      firstSentence("Shares rose on Oct. 12 after the report.  More follows.")
    ).toBe("Shares rose on Oct. 12 after the report.");
  });

  it("returns the whole text with no sentence end", () => {
    expect(firstSentence("no end here")).toBe("no end here");
  });
});

describe("clipping at a sentence end", () => {
  it("lastSentenceEnd ignores a cut right after an abbreviation", () => {
    const text = "Shares rose on Oct. 12 after the report. Later news.";
    const cut = text.indexOf("12") - 1;
    expect(lastSentenceEnd(text, cut)).toBe(-1);
    expect(lastSentenceEnd(text, text.length)).toBe(text.length);
  });

  it("clipFeedSummary does not clip inside 'Oct. 12'", () => {
    const head = "x".repeat(1150);
    const text = `${head}. Shares rose on Oct. 12 after the report and kept rising for days to come, analysts said.`;
    const clipped = clipFeedSummary(text);
    expect(clipped).toBe(`${head}.`);
  });
});
