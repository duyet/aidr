import { describe, expect, it } from "vitest";
import {
  firstSentence,
  lastSentenceEnd,
  sentenceEnds,
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

describe("a sentence ends only before a capital, digit or opening quote", () => {
  it.each([
    "Albertsons Cos. is using ChatGPT Enterprise across stores.",
    'Critics shouted "Cease and desist!" using the Grok AI tool.',
    "Hawley (R-Mo.) dẫn dắt nhóm nghị sĩ.",
    "Will it ship? and includes a link to the docs.",
    "Lagging behind… mostly.",
  ])("does not cut before lowercase: %s", (text) => {
    expect(splitSentences(text)).toEqual([text]);
  });

  it("still splits before a capital, a digit and an opening quote", () => {
    expect(
      splitSentences('It ships. "Quoted" next. 2026 follows. Đây là.')
    ).toEqual(["It ships.", '"Quoted" next.', "2026 follows.", "Đây là."]);
  });

  it("treats Cos and Bros as company forms", () => {
    expect(splitSentences("Sold by Warner Bros. The deal closed.")).toEqual([
      "Sold by Warner Bros.",
      "The deal closed.",
    ]);
  });
});

describe("a lone capital before a period is an initial", () => {
  it.each([
    "Plan B. It covers the gap.",
    "GTA V. Odyssey claims a record.",
    "Shares of Class A. The proceeds fund growth.",
  ])("accepted tradeoff, not a boundary: %s", (text) => {
    expect(splitSentences(text)).toEqual([text]);
  });
});

/** First sentences from production summaries that ran into a link on master
 *  after the capital-letter rule (#650). */
describe("a sentence ends before a link or repo tag", () => {
  const LINKS =
    "https://cims.nyu.edu/~tristanb/statement.pdf https://cims.nyu.edu/~tristanb/euler.pdf https://github.com/tristanbuckmaster/fluid_lean";
  const REAL: Array<[string, string]> = [
    [
      "Today, Levent Alpöge and I have made public three results: finite-time blowup with smooth forcing for incompressible porous media, for Boussinesq, and for 3d incompressible Euler.",
      LINKS,
    ],
    [
      "Hôm nay, Levent Alpöge và tôi đã công bố ba kết quả nghiên cứu: hiện tượng bùng nổ thời gian hữu hạn với lực tác động trơn dành cho mô hình truyền thông rỗng không nén được, cho hệ Boussinesq và cho phương trình Euler 3D không nén được.",
      LINKS,
    ],
    [
      "Today Reuters and the Wall Street Journal both reported about rogue AI agents at OpenAI attacking RubyGems.org.",
      "https://www.rubyhack.ai/ has an amazing writeup, and you should read it.",
    ],
    [
      'I recently watched the talk by Scott Jenson titled "Are we really going to use the same Desktop UX forever?"',
      "https://www.youtube.com/watch?v=V7AfAcQwLW0&t=445s.",
    ],
    [
      'Tôi vừa xem bài thuyết trình của Scott Jenson mang tên "Are we really going to use the same Desktop UX forever?"',
      "https://www.youtube.com/watch?v=V7AfAcQwLW0&t=445s.",
    ],
  ];

  it.each(REAL)("firstSentence stops before the link: %s", (first, rest) => {
    expect(firstSentence(`${first} ${rest}`)).toBe(first);
    expect(splitSentences(`${first} ${rest}`)[0]).toBe(first);
  });

  it("keeps the Vietnamese day-card line under the 400-char cap", () => {
    const [first, rest] = REAL[1] as [string, string];
    expect(firstSentence(`${first} ${rest}`).length).toBeLessThanOrEqual(400);
  });

  it.each([
    ["http://example.com/a"],
    ["www.example.com"],
    ["duyet/aidr"],
    ["vllm-project/vllm"],
    ["1password/cli"],
  ])("splits before %s", (token) => {
    expect(splitSentences(`It shipped today. ${token} has the notes.`)).toEqual(
      ["It shipped today.", `${token} has the notes.`]
    );
  });

  it("splits after ? and ! too", () => {
    expect(splitSentences("Is it live? https://aidr.today")).toEqual([
      "Is it live?",
      "https://aidr.today",
    ]);
  });

  it.each([
    "It rose 12/10 of the way.",
    "Shipped on 2026/10/14 after review.",
    "Cut it by 3/4 and rest.",
  ])("does not split before a fraction or date: %s", (tail) => {
    expect(splitSentences(`Stocks rose. ${tail}`)).toEqual([
      "Stocks rose.",
      tail,
    ]);
  });

  it.each([
    "Mr. acme/tool is the owner.",
    "See e.g. acme/tool for details.",
    "Plan B. acme/tool follows.",
    "Debuts at No. acme/tool soon.",
  ])("does not split inside an abbreviation: %s", (text) => {
    expect(splitSentences(text)).toHaveLength(1);
  });

  it("still joins a lowercase word after a period", () => {
    expect(splitSentences("It ended. and then it began.")).toHaveLength(1);
  });
});

describe("scan cost", () => {
  const unit = "Mr. Smith met Dr. Jones on Oct. 12. It ended. ";
  const SCALE = 8;
  // Linear work gives a ratio near 8, quadratic near 64. Comparing two sizes
  // on the same machine cancels CPU speed and suite load, which an absolute
  // millisecond bound does not.
  const MAX_RATIO = 20;

  /** Best of three runs, so one descheduled run cannot skew the result. */
  function minMs(fn: () => void): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      fn();
      best = Math.min(best, performance.now() - start);
    }
    return best;
  }

  function growth(make: (n: number) => string, run: (s: string) => void) {
    const small = make(1);
    const large = make(SCALE);
    run(small);
    // Floor the divisor: a sub-timer-resolution small run must not inflate it.
    return (
      minMs(() => run(large)) /
      Math.max(
        minMs(() => run(small)),
        0.05
      )
    );
  }

  const prose = (k: number) => unit.repeat(1_400 * k);

  it("splitSentences scales linearly", () => {
    expect(prose(SCALE).length).toBeGreaterThan(500_000 / 2);
    expect(splitSentences(prose(SCALE)).length).toBeGreaterThan(5_000);
    expect(growth(prose, splitSentences)).toBeLessThan(MAX_RATIO);
  });

  it("clipFeedSummary scales linearly", () => {
    expect(growth(prose, clipFeedSummary)).toBeLessThan(MAX_RATIO);
  });

  it("a dot-heavy run scales linearly", () => {
    expect(growth((k) => "a.".repeat(20_000 * k), sentenceEnds)).toBeLessThan(
      MAX_RATIO
    );
  });
});
