import { beforeEach, describe, expect, it, vi } from "vitest";
import { fitSentences, fitText, fitWords } from "../notify/fit-text.js";
import { captionSummaryFor } from "../notify/story-summary.js";
import {
  buildAlbumCaption,
  buildDigestMessage,
  buildStoryCaption,
  fitHighlightDigest,
  storySummaryBudget,
} from "../notify/telegram.js";
import type { DailyDigest, StoryPayload } from "../notify/types.js";
import type { Env } from "../types.js";

const completeJson = vi.hoisted(() => vi.fn());
vi.mock("../llm.js", () => ({ completeJson }));

const EN_SENTENCE =
  'OpenAI & partners said the <beta> program, which runs through "March", covers 372 results. ';
const VI_SENTENCE =
  'OpenAI và các đối tác cho biết chương trình <beta> kéo dài đến "tháng Ba" gồm 372 kết quả. ';

/** Visible text of a Telegram HTML caption: tags removed, entities decoded. */
function visible(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** Telegram HTML is valid when every `&` starts a known entity and the tags
 *  that the adapter emits are balanced. */
function expectValidHtml(html: string) {
  expect(html).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
  const open = (html.match(/<b>/g) ?? []).length;
  const close = (html.match(/<\/b>/g) ?? []).length;
  expect(open).toBe(close);
  const links = (html.match(/<a /g) ?? []).length;
  expect(links).toBe((html.match(/<\/a>/g) ?? []).length);
}

const story = (over: Partial<StoryPayload> = {}): StoryPayload => ({
  id: "9b955ce8af2763d0",
  url: "https://example.com/story",
  title: "The Mathocalypse",
  summary: EN_SENTENCE.repeat(30),
  image_url: null,
  category: "Research",
  points: 2,
  comments: 0,
  rank_score: 9,
  llm_importance: 9,
  lang: "en",
  ...over,
});

describe("fit-text", () => {
  it("returns text that already fits unchanged", () => {
    expect(fitText("Short and whole.", 50)).toBe("Short and whole.");
  });

  it("prefers whole sentences and adds no ellipsis", () => {
    const text =
      "First one here. Second one follows. Third one is long enough.";
    expect(fitSentences(text, 40)).toBe("First one here. Second one follows.");
    expect(fitText(text, 40)).toBe("First one here. Second one follows.");
  });

  it("does not end a sentence at an initialism", () => {
    expect(fitSentences("U.S. officials agreed. Then more.", 25)).toBe(
      "U.S. officials agreed."
    );
  });

  it("falls back to whole words plus an ellipsis, never mid-word", () => {
    const text = "internationalization considerations demand attention soon";
    for (let budget = 5; budget < text.length; budget++) {
      const out = fitWords(text, budget);
      expect(out.length).toBeLessThanOrEqual(budget);
      if (!out) continue;
      expect(out.endsWith("…")).toBe(true);
      const kept = out.slice(0, -1);
      // Every kept word is a whole word of the source.
      expect(text.startsWith(kept)).toBe(true);
      expect(text[kept.length]).toBe(" ");
    }
  });

  it("returns nothing for one unbreakable token that does not fit", () => {
    expect(fitText("x".repeat(100), 40)).toBe("");
  });

  it("drops a dangling comma before the ellipsis", () => {
    expect(fitWords("alpha beta, gamma delta epsilon", 14)).toBe("alpha beta…");
  });
});

describe("story caption fits without mid-word cuts", () => {
  for (const lang of ["en", "vi"] as const) {
    const sentence = lang === "en" ? EN_SENTENCE : VI_SENTENCE;

    it(`${lang}: keeps whole sentences inside 1024 with entities intact`, () => {
      const s = story({ lang, summary: sentence.repeat(30) });
      const caption = buildStoryCaption(s);
      expect(visible(caption).length).toBeLessThanOrEqual(1024);
      expectValidHtml(caption);
      const body = visible(caption).split("\n\n")[1] ?? "";
      expect(body.endsWith(".")).toBe(true);
      expect(body).not.toContain("…");
      // Whole sentences only: the body is a repeat count of one sentence.
      const count = Math.round((body.length + 1) / sentence.length);
      expect(count).toBeGreaterThan(1);
      expect(body).toBe(Array(count).fill(sentence.trim()).join(" "));
    });

    it(`${lang}: the album caption keeps its Read link inside 1024`, () => {
      const s = story({ lang, summary: sentence.repeat(30) });
      const caption = buildAlbumCaption(s);
      expect(visible(caption).length).toBeLessThanOrEqual(1024);
      expectValidHtml(caption);
    });
  }

  it("cuts at a word with an ellipsis only when no sentence fits", () => {
    const longSentence = `${"alpha & beta ".repeat(80)}done.`;
    const caption = buildStoryCaption(story({ summary: longSentence }));
    const body = visible(caption).split("\n\n")[1] ?? "";
    expect(body.endsWith("…")).toBe(true);
    const kept = body.slice(0, -1);
    expect(longSentence.startsWith(kept)).toBe(true);
    expect(longSentence[kept.length]).toBe(" ");
    expectValidHtml(caption);
    expect(visible(caption).length).toBeLessThanOrEqual(1024);
  });

  it("prefers the stored caption summary over the long source summary", () => {
    const caption = buildStoryCaption(
      story({ caption_summary: "A complete short summary." })
    );
    expect(caption).toContain("A complete short summary.");
    expect(caption).not.toContain("OpenAI");
  });

  const titleOf = (title: string) =>
    visible(buildStoryCaption(story({ title, summary: "" }))).split(
      "\n\n"
    )[0] ?? "";

  it("shortens a long title with no clause break at a word boundary", () => {
    const source = "Breaking news about everything ".repeat(30).trim();
    const title = titleOf(source);
    expect(title.length).toBeLessThanOrEqual(140);
    expect(title.endsWith("…")).toBe(true);
    const kept = title.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(" ");
  });

  it("cuts a long title at its last clause break within 140 characters", () => {
    const head =
      "OpenAI signs a $10B deal with Broadcom for custom AI chips, the first it designed in house";
    const source = `${head}, as it races to secure compute for the models it plans to train through 2030 and beyond`;
    expect(source.length).toBeGreaterThan(140);
    expect(titleOf(source)).toBe(head);
  });

  it("drops a trailing credit sentence from the title", () => {
    expect(titleOf("Nvidia invests $5B in Intel. From Bloomberg.")).toBe(
      "Nvidia invests $5B in Intel."
    );
    expect(
      titleOf("OpenAI ký thỏa thuận chip 10 tỷ USD với Broadcom. Theo Reuters.")
    ).toBe("OpenAI ký thỏa thuận chip 10 tỷ USD với Broadcom.");
  });
});

describe("digest message fits without cutting a line", () => {
  const titles = [
    "Stanford DeLM Beats Claude Code Accuracy by 17.5 Percentage Points",
    "Google AI Matches Doctor Diagnoses in 90% of Cases in First Real Clinic Study",
    "OpenAI revenue keeps surging as company seeks $30 billion in fresh capital",
    "OpenAI Math Papers Destroyed Careers, NYU Professor Says",
    "Anthropic bans 'abusive or cruel behavior' towards Claude",
    "Prime Agent Rewrites Itself in Rust with 2,000 Agent Swarm",
    "Microsoft deploys a new low-latency decoding architecture internally",
    "Meta unwinds an acquisition and the startup raises fresh funding",
  ];
  const clause = "A new coordination system lets parallel workers solve tasks.";
  const digest = (withLead: boolean): DailyDigest => ({
    lang: "en",
    date: "2026-10-10",
    bullets: titles.map((title, i) => ({
      text: `${title} — ${clause} ${i}`,
      ...(withLead ? { lead: title } : {}),
      url: `https://aidr.today/abcdef1${i}`,
    })),
  });

  it("drops summary clauses whole and keeps every headline intact", () => {
    const fitted = fitHighlightDigest(digest(true), 1024);
    const message = buildDigestMessage(fitted, 1024);
    expect(visible(message).length).toBeLessThanOrEqual(1024);
    expectValidHtml(message);
    // All eight stories named; headlines are whole, nothing is cut.
    expect(fitted.bullets).toHaveLength(8);
    for (const title of titles) expect(message).toContain(escapeText(title));
    expect(message).not.toContain("…");
    // No half clause survives: a bullet is a headline, or headline + whole clause.
    for (const bullet of fitted.bullets) {
      const tail = bullet.text.split(" — ")[1];
      if (tail) expect(tail.endsWith(`${clause} ${tail.at(-1)}`)).toBe(true);
    }
  });

  it("shortens six overflowing lines to fit 4000, none cut mid-sentence", () => {
    // Six long clauses (well past what a real summary sentence is) overflow
    // the message. The fitter drops whole clauses first, so every line is a
    // headline or a headline with its whole clause, and all six stay.
    const sentence = `${"An unusually long but complete summary sentence. ".repeat(14).trim()}`;
    const six: DailyDigest = {
      lang: "en",
      date: "2026-10-10",
      bullets: titles.slice(0, 6).map((title, i) => ({
        text: `${title} — ${sentence}`,
        lead: title,
        url: `https://aidr.today/abcdef1${i}?utm=${"x".repeat(60)}`,
      })),
    };
    const fitted = fitHighlightDigest(six, 4000);
    const message = buildDigestMessage(fitted);
    expect(visible(message).length).toBeLessThanOrEqual(4000);
    expect(fitted.bullets).toHaveLength(6);
    expect(message.split("<a href=").length - 1).toBe(6);
    for (const [i, bullet] of fitted.bullets.entries()) {
      expect([titles[i], `${titles[i]} — ${sentence}`]).toContain(bullet.text);
    }
    // Something was kept whole: the fitter stops once the lines fit.
    expect(fitted.bullets.some((bullet) => bullet.text.includes(" — "))).toBe(
      true
    );
  });

  it("shortens headlines at a word boundary only when headlines alone overflow", () => {
    const long = "word ".repeat(30).trim();
    const big: DailyDigest = {
      lang: "vi",
      date: "2026-10-10",
      bullets: Array.from({ length: 8 }, (_, i) => ({
        text: `${long} ${i}`,
        url: `https://aidr.today/abcdef1${i}`,
      })),
    };
    const fitted = fitHighlightDigest(big, 1024);
    const message = buildDigestMessage(fitted, 1024);
    expect(fitted.bullets).toHaveLength(8);
    expect(visible(message).length).toBeLessThanOrEqual(1024);
    for (const bullet of fitted.bullets) {
      const body = bullet.text.replace(/…$/, "");
      expect(body).toMatch(/word$|word \d$/);
    }
  });

  function escapeText(text: string): string {
    return text.replaceAll("&", "&amp;").replaceAll("'", "&#39;");
  }
});

describe("captionSummaryFor", () => {
  const writes: unknown[][] = [];
  let cached: { text: string; source_hash: string } | null = null;
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => cached,
          run: async () => {
            writes.push([sql, ...args]);
          },
        }),
      }),
    },
  } as unknown as Env;

  const budget = storySummaryBudget(story(), 20);

  beforeEach(() => {
    completeJson.mockReset();
    writes.length = 0;
    cached = null;
  });

  it("writes a summary inside the budget, stores it, and returns it", async () => {
    const text =
      "OpenAI released 372 results. A proof of the UGC is among them.";
    completeJson.mockResolvedValue(JSON.stringify({ summary: text }));
    const out = await captionSummaryFor(env, story(), budget);
    expect(out).toBe(text);
    expect(out?.length).toBeLessThanOrEqual(budget);
    expect(writes).toHaveLength(1);
    expect(String(writes[0]?.[0])).toContain("notify_summaries");
  });

  it("writes Vietnamese from the Vietnamese summary only", async () => {
    const text = "OpenAI công bố 372 kết quả. Có cả chứng minh UGC.";
    completeJson.mockResolvedValue(JSON.stringify({ summary: text }));
    const s = story({ lang: "vi", summary: VI_SENTENCE.repeat(30) });
    expect(await captionSummaryFor(env, s, budget)).toBe(text);
    const prompt = JSON.stringify(completeJson.mock.calls[0]?.[1]);
    expect(prompt).toContain("Vietnamese");
    expect(prompt).not.toContain("OpenAI & partners");
  });

  it("does not call the model when the summary already fits", async () => {
    for (const summary of [
      "Short and whole.",
      "Google I/O opens in the US on May 20 with Gemini news.",
    ]) {
      expect(
        await captionSummaryFor(env, story({ summary }), budget)
      ).toBeNull();
    }
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("rewrites a summary that fits but reads as feed or press-release copy", async () => {
    const defective: Array<[string, "en" | "vi"]> = [
      [
        "Reflection ra mắt Beam. Bài viết về Beam của Reflection xuất hiện lần đầu trên The Decoder.",
        "vi",
      ],
      [
        "Claude Haiku 5.5 là mô hình nhỏ nhanh nhất và mạnh nhất của chúng tôi.",
        "vi",
      ],
      ["Bạn có thể tìm hiểu thêm về GLM 5.3 trên Amazon Bedrock.", "vi"],
      ["We release our models to help improve defenses.", "en"],
    ];
    for (const [summary, lang] of defective) {
      const text = lang === "vi" ? "Reflection ra mắt Beam." : "Clean text.";
      completeJson.mockResolvedValueOnce(JSON.stringify({ summary: text }));
      const s = story({ summary, lang });
      expect(await captionSummaryFor(env, s, budget)).toBe(text);
    }
    expect(completeJson).toHaveBeenCalledTimes(defective.length);
  });

  it("rewrites a Vietnamese teaser that ends in an ellipsis; English is unchanged", async () => {
    const teasers = [
      "Các nhà phân tích cho rằng chi phí điện đang tăng nhanh, điều mà nhiều công ty Mỹ...",
      "Các nhà phân tích cho rằng chi phí điện đang tăng nhanh tại nhiều bang của Mỹ […]",
      "Các nhà phân tích cho rằng chi phí điện đang tăng nhanh tại nhiều bang. Đọc thêm",
    ];
    for (const summary of teasers) {
      completeJson.mockResolvedValueOnce(
        JSON.stringify({ summary: "Chi phí điện đang tăng nhanh." })
      );
      expect(
        await captionSummaryFor(env, story({ summary, lang: "vi" }), budget)
      ).toBe("Chi phí điện đang tăng nhanh.");
    }
    expect(completeJson).toHaveBeenCalledTimes(teasers.length);

    completeJson.mockClear();
    const english =
      "Analysts say power costs are rising fast, which many US...";
    expect(
      await captionSummaryFor(env, story({ summary: english }), budget)
    ).toBeNull();
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("reuses the stored summary without a second model call", async () => {
    const first = "Stored summary, finished.";
    completeJson.mockResolvedValue(JSON.stringify({ summary: first }));
    await captionSummaryFor(env, story(), budget);
    const hash = String(writes[0]?.[3]);
    cached = { text: first, source_hash: hash };
    completeJson.mockClear();
    expect(await captionSummaryFor(env, story(), budget)).toBe(first);
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("regenerates when the source summary changed", async () => {
    cached = { text: "Old text.", source_hash: "stale" };
    completeJson.mockResolvedValue(JSON.stringify({ summary: "New text." }));
    expect(await captionSummaryFor(env, story(), budget)).toBe("New text.");
  });

  it("rejects over-budget, ellipsis, unfinished or wrong-language answers", async () => {
    const bad = [
      "x ".repeat(budget),
      "Cut off mid sentence…",
      "No full stop at the end",
      "Câu tiếng Việt cho kênh tiếng Anh.",
    ];
    for (const summary of bad) {
      completeJson.mockResolvedValueOnce(JSON.stringify({ summary }));
      expect(await captionSummaryFor(env, story(), budget)).toBeNull();
    }
    expect(writes).toHaveLength(0);
  });

  it("accepts an English answer that names Société Générale or Erdős", async () => {
    const text =
      "Lenders such as MUFG, SMBC and Société Générale cut their exposure. Two Erdős problems fell.";
    completeJson.mockResolvedValueOnce(JSON.stringify({ summary: text }));
    expect(await captionSummaryFor(env, story(), budget)).toBe(text);
  });

  it("keeps the whole leading sentences of an answer that overshoots the budget", async () => {
    const first = `${"Broadcom backs a 42 billion USD debt package for Anthropic ".repeat(3).trim()}.`;
    const overshoot = `${first} ${"Chip stocks fell after the remarks. ".repeat(10).trim()}`;
    expect(first.length).toBeLessThan(budget);
    expect(overshoot.length).toBeGreaterThan(budget);
    completeJson.mockResolvedValueOnce(JSON.stringify({ summary: overshoot }));
    const out = await captionSummaryFor(env, story(), budget);
    expect(out?.startsWith(first)).toBe(true);
    expect(out?.length).toBeLessThanOrEqual(budget);
    expect(out).toMatch(/\.$/);
  });

  it("returns null, never throws, when the model fails", async () => {
    completeJson.mockRejectedValue(new Error("anyrouter chain exhausted"));
    expect(await captionSummaryFor(env, story(), budget)).toBeNull();
  });

  it("leaves trimming to the caption when there is no room to rewrite", async () => {
    expect(await captionSummaryFor(env, story(), 40)).toBeNull();
    expect(completeJson).not.toHaveBeenCalled();
  });
});

describe("story caption never restates its headline", () => {
  const nvidia = story({
    title:
      "IDC: Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026, as its market share slid to 34% amid US export curbs and rising domestic competition (Reuters)",
    summary:
      "Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026, as its market share slid to 34% amid US export curbs and rising domestic competition.",
    category: "Chips",
  });

  it("drops a summary that only repeats the headline", () => {
    const title =
      "Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026 (Reuters)";
    const caption = visible(
      buildStoryCaption({
        ...nvidia,
        title,
        summary:
          "Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026.",
      })
    );
    expect(caption.split("\n\n")).toEqual([title, "#Chips  ·  ▲ 2"]);
  });

  it("keeps the summary when the title is cut to its first clause", () => {
    // 164 characters: the caption shows the clause before ", as its market
    // share slid", so the summary is the only place the 34% share appears.
    const caption = visible(buildStoryCaption(nvidia));
    expect(caption.split("\n\n")).toEqual([
      "IDC: Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026",
      nvidia.summary,
      "#Chips  ·  ▲ 2",
    ]);
  });

  it("keeps a lead whose only new word is a tense marker, and the facts after it", () => {
    const s = story({
      title:
        "Nvidia đàm phán mua lại startup mô hình 'mở' Reflection AI tại Mỹ",
      summary:
        "Nvidia đang đàm phán để mua lại startup mô hình 'mở' Reflection AI tại Mỹ. Thương vụ có thể trị giá 25 tỷ USD.",
      lang: "vi",
    });
    // "đang" is aspect, so it is content: the lead stays. A repeat costs a
    // line; a dropped tense could drop a fact.
    const caption = visible(buildStoryCaption(s));
    expect(caption).toContain("Nvidia đang đàm phán");
    expect(caption).toContain("Thương vụ có thể trị giá 25 tỷ USD.");
  });

  it.each([
    [
      "EN future headline, past clause",
      "Meta will launch Muse Wonder",
      "Meta has launched Muse Wonder.",
      true,
    ],
    [
      "VI future headline, past clause",
      "Meta sẽ ra mắt Muse Wonder",
      "Meta đã ra mắt Muse Wonder.",
      true,
    ],
    // Were "dropped" while "has" and "đang" were stopwords. Tense is content
    // now, so these stay: a repeat costs a line, a lost tense a fact.
    [
      "EN present headline, perfect clause",
      "Anthropic launches Claude for Chrome to all paid users",
      "Anthropic has launched Claude for Chrome to all paid users.",
      true,
    ],
    [
      "VI headline without aspect, clause with đang",
      "Nvidia đàm phán mua lại startup mô hình mở Reflection AI tại Mỹ",
      "Nvidia đang đàm phán mua lại startup mô hình mở Reflection AI tại Mỹ.",
      true,
    ],
    [
      "EN past headline, same-tense restatement",
      "Meta launched Muse Wonder",
      "Meta launched Muse Wonder.",
      false,
    ],
    [
      "VI past headline, same-tense restatement",
      "Meta đã ra mắt Muse Wonder",
      "Meta đã ra mắt Muse Wonder.",
      false,
    ],
  ])("tense words are content: %s", (_name, title, summary, kept) => {
    const s = story({
      title,
      summary,
      lang: /đã|sẽ/.test(title) ? "vi" : "en",
    });
    expect(summaryOf(s) !== null).toBe(kept);
  });

  it.each([
    [
      "VI hedge",
      "Nvidia bán chip H20 cho Trung Quốc",
      "Nvidia được cho là bán chip H20 cho Trung Quốc.",
      "vi",
    ],
    ["VI passive", "Microsoft kiện OpenAI", "Microsoft bị OpenAI kiện.", "vi"],
    [
      "VI allowed to",
      "Nvidia bán chip tại Trung Quốc",
      "Nvidia được bán chip tại Trung Quốc.",
      "vi",
    ],
    [
      "EN passive",
      "Nvidia acquired Reflection AI",
      "Nvidia acquired by Reflection AI.",
      "en",
    ],
    [
      "EN plan",
      "Nvidia buys Reflection AI",
      "Nvidia to buy Reflection AI.",
      "en",
    ],
  ])("voice and hedge words are content: %s", (_name, title, summary, lang) => {
    expect(
      summaryOf(story({ title, summary, lang: lang as "en" | "vi" }))
    ).not.toBeNull();
  });

  it("keeps a lead that echoes the headline but carries a new number", () => {
    const s = story({
      title:
        "IDC: lượng chip AI của Nvidia xuất sang Trung Quốc giảm 44% YoY trong H1 2026",
      summary:
        "Theo IDC, lượng chip AI của Nvidia xuất sang Trung Quốc trong H1 2026 đã giảm 44% YoY xuống còn 678.000 đơn vị. Thị phần của hãng trượt xuống 34%.",
      lang: "vi",
    });
    expect(visible(buildStoryCaption(s))).toContain("678.000 đơn vị");
  });

  it("keeps a lead that names a short product headline and describes it", () => {
    const s = story({
      title: "Claude Haiku 5.5",
      summary:
        "Claude Haiku 5.5 is the fastest small model, built for summarization, subagents and browser use.",
    });
    expect(visible(buildStoryCaption(s))).toContain("built for summarization");
  });

  /** The summary paragraph of a caption, or null when only the title and
   *  meta line are left. */
  function summaryOf(s: StoryPayload): string | null {
    const parts = visible(buildStoryCaption(s)).split("\n\n");
    return parts.length === 3 ? (parts[1] ?? null) : null;
  }

  // Production copies shaped "Author / Outlet : <headline> — <dek>". The dek
  // states a fact the headline lacks, so it stays and the byline goes with
  // the headline clause.
  it.each<[string, string, string, string, "en" | "vi"]>([
    [
      "eb89e091 en",
      "Google rolls out Gemini 4 Argon globally via the Gemini API and to Google AI Pro subscribers in the Gemini app and AI Mode, and in Antigravity for Ultra users (Robert Hart/The Verge)",
      "Robert Hart / The Verge : Google rolls out Gemini 4 Argon globally via the Gemini API and to Google AI Pro subscribers in the Gemini app and AI Mode, and in Antigravity for Ultra users — After months of trailing its rivals, Google says Argon competes with the industry's best.",
      "After months of trailing its rivals, Google says Argon competes with the industry's best.",
      "en",
    ],
    [
      "e5d5b6a8 en",
      "Sources: the US restores the UK AISI's access to the latest US models for safety testing, after ordering OpenAI and Anthropic to stop sharing models last month (Tony Diver/Telegraph)",
      "Tony Diver / Telegraph : Sources: the US restores the UK AISI's access to the latest US models for safety testing, after ordering OpenAI and Anthropic to stop sharing models last month — US had blocked regulators from reviewing frontier models from Anthropic, OpenAI and Google DeepMind",
      "US had blocked regulators from reviewing frontier models from Anthropic, OpenAI and Google DeepMind",
      "en",
    ],
    [
      "6748de17 en",
      "Sources: Nvidia is in talks to acquire or invest more into US open-weights AI startup Reflection AI; the deal may be an acquihire to avoid antitrust scrutiny (Financial Times)",
      "Financial Times : Sources: Nvidia is in talks to acquire or invest more into US open-weights AI startup Reflection AI; the deal may be an acquihire to avoid antitrust scrutiny — Donald Trump's administration hopes the company will rival cheap Chinese alternatives such as DeepSeek",
      "Donald Trump's administration hopes the company will rival cheap Chinese alternatives such as DeepSeek",
      "en",
    ],
    [
      "fe16e09a en",
      'Anthropic updates its usage policy to ban "sustained and needless abusive or cruel behavior" toward Claude, ending chats as the primary enforcement mechanism (Hayden Field/The Verge)',
      "Hayden Field / The Verge : Anthropic updates its usage policy to ban “sustained and needless abusive or cruel behavior” toward Claude, ending chats as the primary enforcement mechanism — The usage policy update also adds new rules addressing propaganda campaigns, surveillance, and weapon development.",
      "The usage policy update also adds new rules addressing propaganda campaigns, surveillance, and weapon development.",
      "en",
    ],
    [
      "56129488 en",
      "Sources: Amazon is in talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart for ~$6B in September (Wall Street Journal)",
      "Wall Street Journal : Sources: Amazon is in talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart for ~$6B in September — San Francisco company's software makes it easier for developers to switch between different AI chips",
      "San Francisco company's software makes it easier for developers to switch between different AI chips",
      "en",
    ],
    [
      "a3e8e19d en",
      "Apple HomeView demo: a square screen with a personalized, iPhone-like experience based on facial recognition, up to six users, Siri AI, and a closed ecosystem (Nicole Nguyen/Wall Street Journal)",
      "Nicole Nguyen / Wall Street Journal : Apple HomeView demo: a square screen with a personalized, iPhone-like experience based on facial recognition, up to six users, Siri AI, and a closed ecosystem — HomeView is a square-shaped screen for smart home control, hands-free FaceTime calls and access to Siri AI",
      "HomeView is a square-shaped screen for smart home control, hands-free FaceTime calls and access to Siri AI",
      "en",
    ],
    [
      "e5c0cec3 en",
      "A global chip stock sell-off deepens after Broadcom's CEO likened AI investing to a casino, with Samsung down as much as 8.8%, SK Hynix 9.2%, and Micron 4% (Financial Times)",
      "Financial Times : A global chip stock sell-off deepens after Broadcom's CEO likened AI investing to a casino, with Samsung down as much as 8.8%, SK Hynix 9.2%, and Micron 4% — Declines for Samsung and SK Hynix drag Kospi sharply lower as investors fret over scale of AI investment",
      "Declines for Samsung and SK Hynix drag Kospi sharply lower as investors fret over scale of AI investment",
      "en",
    ],
    [
      "8993369f en",
      'Sources: Epic has delayed the release of an upcoming game, instructing developers to implement an "AI first" production model with "no more hand-written code" (Jason Schreier/Bloomberg)',
      "Jason Schreier / Bloomberg : Sources: Epic has delayed the release of an upcoming game, instructing developers to implement an “AI first” production model with “no more hand-written code” — The company told the team behind the upcoming shooter that it will now be an ‘AI first’ production",
      "The company told the team behind the upcoming shooter that it will now be an ‘AI first’ production",
      "en",
    ],
    [
      "96b8c7ef en",
      "An interview with Mark Zuckerberg, who says Meta has caught up with rivals at the frontier of AI with its Wonder model and rejects calls for a slowdown (Hannah Murphy/Financial Times)",
      "Hannah Murphy / Financial Times : An interview with Mark Zuckerberg, who says Meta has caught up with rivals at the frontier of AI with its Wonder model and rejects calls for a slowdown — FT interview: tech billionaire touts release of new Muse Wonder model after vast spending to challenge rivals in AI race",
      "FT interview: tech billionaire touts release of new Muse Wonder model after vast spending to challenge rivals in AI race",
      "en",
    ],
    [
      "376196c1 en",
      'Meta says it plans to power its Muse AI agent with Wonder, starting with subscribers, and will develop specialized models it "can bring to everyone using Muse" (Robert Hart/The Verge)',
      "Robert Hart / The Verge : Meta says it plans to power its Muse AI agent with Wonder, starting with subscribers, and will develop specialized models it “can bring to everyone using Muse” — Meta says the models compete with the industry's best and will soon power its Muse agent. … Meta is making up for lost time in the AI race.",
      "Meta says the models compete with the industry's best and will soon power its Muse agent. … Meta is making up for lost time in the AI race.",
      "en",
    ],
    [
      "f72c187e vi",
      "Chủ tịch Microsoft Brad Smith kêu gọi thiết lập các quy định an toàn AI toàn cầu, lập luận rằng sữa và máy giặt hiện đang phải đối mặt với các tiêu chuẩn an toàn nghiêm ngặt hơn (Mitchell Labiak/BBC)",
      "Mitchell Labiak / BBC: Chủ tịch Microsoft Brad Smith kêu gọi các quy định an toàn toàn cầu cho AI, lập luận rằng sữa và máy giặt hiện đang phải đối mặt với các tiêu chuẩn an toàn nghiêm ngặt hơn — Chủ tịch Microsoft cho biết sữa và máy giặt hiện được quản lý chặt chẽ hơn cả AI.",
      "Chủ tịch Microsoft cho biết sữa và máy giặt hiện được quản lý chặt chẽ hơn cả AI.",
      "vi",
    ],
    [
      "6194e048 vi",
      "Nguồn tin tiết lộ quyết định ra mắt Muse bất chấp lo ngại an toàn của Mark Zuckerberg, sau khi thấy sản phẩm agent tương tự của startup AI Instinct thu hút được người dùng",
      "Eli Tan / New York Times: Nguồn tin tiết lộ quyết định ra mắt Muse bất chấp lo ngại an toàn của Mark Zuckerberg, sau khi thấy sản phẩm agent tương tự của startup AI Instinct thu hút được người dùng — Meta từng hoãn phát hành ứng dụng AI agent của mình là Muse trong nhiều tháng do lo ngại an toàn. Sau đó, đối thủ mới xuất hiện đã buộc Mark Zuckerberg phải ra quyết định.",
      "Meta từng hoãn phát hành ứng dụng AI agent của mình là Muse trong nhiều tháng do lo ngại an toàn. Sau đó, đối thủ mới xuất hiện đã buộc Mark Zuckerberg phải ra quyết định.",
      "vi",
    ],
  ])(
    "keeps the dek after a restated headline clause (%s)",
    (_id, title, summary, dek, lang) => {
      expect(summaryOf(story({ title, summary, lang }))).toBe(dek);
    }
  );

  // The headline clause rewords the headline ("cho biết", "thấy",
  // "physical"), so it stays in front of the dek.
  it.each<[string, string, string, "en" | "vi"]>([
    [
      "626a46c9 vi",
      "Phân tích 857 bản phát hành từ chín phòng thí nghiệm AI Trung Quốc từ năm 2021 đến tháng 9 năm 2026: chỉ 3,6% công bố kết quả an toàn và chỉ 1,1% làm điều đó khi ra mắt (SemiAnalysis)",
      "SemiAnalysis: Phân tích 857 bản phát hành từ chín phòng thí nghiệm AI Trung Quốc từ năm 2021 đến tháng 9 năm 2026 cho thấy chỉ 3,6% công bố kết quả an toàn và chỉ 1,1% làm vậy ngay khi ra mắt — vấn đề an toàn AI đang vô cùng nóng bỏng. Vào ngày 12 tháng 9 năm 2026, Dario Amodei xuất bản một bài tiểu luận lập luận rằng các phòng thí nghiệm frontier model phải chủ động làm chậm tốc độ cải tiến năng lực mô hình.",
      "vi",
    ],
    [
      "158de3f7 vi",
      "AI đang thúc đẩy nền kinh tế lừa đảo trị giá khoảng 442 tỷ USD, quy mô lớn hơn cả thị trường cocaine toàn cầu, khi ngành công nghiệp lừa đảo Trung Quốc lan rộng ra ngoài các khu phức hợp kiên cố ở châu Á (Bloomberg)",
      "Bloomberg cho biết AI đang thúc đẩy nền kinh tế lừa đảo trị giá khoảng 442 tỷ USD, quy mô lớn hơn cả thị trường cocaine toàn cầu, khi ngành công nghiệp lừa đảo Trung Quốc lan rộng ra ngoài các khu phức hợp kiên cố ở châu Á — thông qua máy tính Samsung, điện thoại Huawei, thiết bị Redmi và hàng chục hộ chiếu Trung Quốc cũng như Malaysia.",
      "vi",
    ],
    [
      "fc760a40 vi",
      "Nhà sản xuất Omron của Nhật Bản cho biết sẽ thâu tóm công ty máy tính công nghiệp Mỹ OnLogic cùng công ty mẹ Interlogic với giá 675 triệu USD để thúc đẩy các nỗ lực AI vật lý",
      "Anton Bridge / Reuters: Nhà sản xuất Omron của Nhật Bản cho biết sẽ thâu tóm công ty máy tính công nghiệp Mỹ OnLogic cùng công ty mẹ Interlogic với giá 675 triệu USD để thúc đẩy các nỗ lực physical AI - nhà sản xuất Omron của Nhật Bản sẽ mua lại công ty máy tính công nghiệp OnLogic ở Mỹ và công ty mẹ Interlogic với giá 675 triệu USD, hãng thông báo hôm thứ Ba.",
      "vi",
    ],
  ])(
    "keeps a reworded headline clause with its dek (%s)",
    (_id, title, summary, lang) => {
      expect(summaryOf(story({ title, summary, lang }))).toBe(summary);
    }
  );

  // Each summary repeats the headline and adds one thing: a hedge, a denial,
  // a negation, a swap of who did what to whom, a number or a name. Dropping
  // it would lose that fact.
  it.each<[string, string, string, "en" | "vi"]>([
    [
      "denial",
      "Nvidia is in talks to buy Reflection AI",
      "Nvidia is in talks to buy Reflection AI, which Reflection denied.",
      "en",
    ],
    [
      "hedge",
      "Nvidia is in talks to buy Reflection AI",
      "Nvidia is reportedly in talks to buy Reflection AI, sources say.",
      "en",
    ],
    [
      "negation",
      "Nvidia is in talks to buy Reflection AI",
      "Nvidia is not in talks to buy Reflection AI.",
      "en",
    ],
    [
      "role swap",
      "OpenAI sues Microsoft over its use of GPT models",
      "Microsoft sues OpenAI over its use of GPT models.",
      "en",
    ],
    [
      "different subject",
      "Nvidia is in talks to buy Reflection AI",
      "Microsoft is in talks to buy Reflection AI.",
      "en",
    ],
    [
      "spelled-out number",
      "OpenAI fires safety researchers over leaks",
      "OpenAI fires three safety researchers over leaks.",
      "en",
    ],
    [
      "name",
      "Microsoft president says UK is best placed to drive AI regulation",
      "Microsoft President Brad Smith says the UK is best placed to drive AI regulation.",
      "en",
    ],
    [
      "vi denial",
      "Nvidia đàm phán mua lại startup mô hình 'mở' Reflection AI tại Mỹ",
      "Nvidia đàm phán mua lại startup mô hình 'mở' Reflection AI tại Mỹ, nhưng Reflection đã phủ nhận.",
      "vi",
    ],
    [
      "vi negation",
      "Nvidia đàm phán mua lại startup mô hình 'mở' Reflection AI tại Mỹ",
      "Nvidia không đàm phán mua lại startup mô hình 'mở' Reflection AI tại Mỹ.",
      "vi",
    ],
  ])("keeps a repeat that adds a %s", (_kind, title, summary, lang) => {
    expect(summaryOf(story({ title, summary, lang }))).toBe(summary);
  });

  // A restatement that adds no word goes: the probe restatements and real
  // copies from the 2165-copy production scan.
  it.each<[string, string, string, "en" | "vi"]>([
    [
      "past tense",
      "Nvidia agrees to buy Reflection AI for $2B",
      "Nvidia agreed to buy Reflection AI for $2B.",
      "en",
    ],
    [
      "606e8d69 vi",
      "OpenAI vừa công bố 700 bản in trước chứa các chứng minh toán học và phản ví dụ",
      "OpenAI vừa công bố 700 bản in trước chứa các chứng minh toán học và phản ví dụ.",
      "vi",
    ],
  ])("drops a summary that adds no word (%s)", (_id, title, summary, lang) => {
    expect(summaryOf(story({ title, summary, lang }))).toBe(null);
  });

  // Over 140 characters the headline is cut to its leading clauses, so a
  // summary that restates all of it is the only place the rest still shows.
  it.each<[string, string, string, string]>([
    [
      "98a28302 en",
      "Anthropic launches the Critical Infrastructure Defense Program to provide AI models, threat research, and on-site support, starting with CrowdStrike and others (Sam Sabin/Axios)",
      "Anthropic launched the Critical Infrastructure Defense Program to provide AI models, threat research, and on-site support, starting with CrowdStrike and others.",
      "starting with CrowdStrike",
    ],
    [
      "6860d785 en",
      "A US Senate investigation led by Senators Warren, Van Hollen, and Blumenthal says some hyperscalers misled the public about AI data centers' costs and benefits (Nik Popli/Time)",
      "A US Senate investigation led by Senators Warren, Van Hollen, and Blumenthal says some hyperscalers misled the public about the costs and benefits of AI data centers.",
      "costs and benefits",
    ],
  ])(
    "keeps a restating summary when the headline is cut (%s)",
    (_id, title, summary, cutFact) => {
      const caption = visible(buildStoryCaption(story({ title, summary })));
      const [shown] = caption.split("\n\n");
      expect(shown).not.toContain(cutFact);
      expect(summaryOf(story({ title, summary }))).toBe(summary);
    }
  );

  const decart =
    "Sources: Amazon is in talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart in September (Wall Street Journal)";

  // Each summary repeats its headline and changes or adds one word. A share
  // of new words lets one word through under a long headline, so any new
  // word keeps the summary.
  it.each<[string, string, string, "en" | "vi"]>([
    [
      "denies report",
      "Nvidia is in talks to buy Reflection AI",
      "Nvidia denies report it is in talks to buy Reflection AI.",
      "en",
    ],
    [
      "says it won't",
      "OpenAI will release GPT-6 open weights this year",
      "OpenAI says it won't release GPT-6 open weights this year.",
      "en",
    ],
    [
      "date: on Tuesday",
      "Nvidia agrees to buy Reflection AI for its open model team",
      "Nvidia agreed on Tuesday to buy Reflection AI for its open model team.",
      "en",
    ],
    [
      "date: last week",
      "Nvidia agrees to buy Reflection AI for its open model team and chips",
      "Nvidia agreed last week to buy Reflection AI for its open model team and chips.",
      "en",
    ],
    [
      "date: yesterday",
      "Nvidia agrees to buy US startup Reflection AI for its open model research team",
      "Nvidia agreed yesterday to buy US startup Reflection AI for its open model research team.",
      "en",
    ],
    [
      "place",
      "Nvidia opens a new AI research lab for robotics and chips",
      "Nvidia opens a new AI research lab in Paris for robotics and chips.",
      "en",
    ],
    [
      "for the first time",
      "Google lets Gemini users export chat history to other apps",
      "For the first time, Google lets Gemini users export chat history to other apps.",
      "en",
    ],
    [
      "after 18 months",
      "Apple ships its delayed Siri AI upgrade to iPhone users",
      "Apple ships its delayed Siri AI upgrade to iPhone users after 18 months.",
      "en",
    ],
    [
      "after twelve months",
      "Apple finally ships its delayed Siri AI upgrade to all iPhone users worldwide",
      "Apple finally ships its delayed Siri AI upgrade to all iPhone users worldwide after twelve months.",
      "en",
    ],
    [
      "after months",
      "Apple finally ships its delayed Siri AI upgrade to all iPhone users worldwide",
      "After months of delay, Apple finally ships its Siri AI upgrade to all iPhone users worldwide.",
      "en",
    ],
    [
      "amount $13B",
      "Anthropic raises new funding led by Lightspeed",
      "Anthropic raises $13B in new funding led by Lightspeed.",
      "en",
    ],
    [
      "amount $5 billion",
      "Anthropic raises new funding led by Lightspeed and Fidelity",
      "Anthropic raises $5 billion in new funding led by Lightspeed and Fidelity.",
      "en",
    ],
    [
      "percentage 7%",
      "Nvidia shares fall after China export curbs",
      "Nvidia shares fall 7% after China export curbs.",
      "en",
    ],
    [
      "percentage 17%",
      "Nvidia shares fall after China export curbs",
      "Nvidia shares fall 17% after China export curbs.",
      "en",
    ],
    [
      "count 3",
      "OpenAI fires safety researchers over leaks",
      "OpenAI fires 3 safety researchers over leaks.",
      "en",
    ],
    [
      "up from $13B",
      "OpenAI annualized revenue hits $20B",
      "OpenAI annualized revenue hits $20B, up from $13B.",
      "en",
    ],
    [
      "up from last year",
      "OpenAI annualized revenue hits $20B as ChatGPT subscriptions grow strongly",
      "OpenAI annualized revenue hits $20B, up from last year, as ChatGPT subscriptions grow strongly.",
      "en",
    ],
    [
      "down from 66%",
      "Nvidia market share in China slides to 34% amid export curbs",
      "Nvidia market share in China slides to 34%, down from 66%, amid export curbs.",
      "en",
    ],
    [
      "plans to",
      "Apple builds its own AI server chips for data centers",
      "Apple plans to build its own AI server chips for data centers.",
      "en",
    ],
    [
      "plans to, long headline",
      "Apple builds its own AI server chips for data centers to cut its reliance on Nvidia",
      "Apple plans to build its own AI server chips for data centers to cut its reliance on Nvidia.",
      "en",
    ],
    [
      "expects to, long headline",
      "Apple builds its own AI server chips for data centers to cut its reliance on Nvidia",
      "Apple expects to build its own AI server chips for data centers to cut its reliance on Nvidia.",
      "en",
    ],
    [
      "could",
      "Amazon buys AI startup Decart at a $7B valuation",
      "Amazon could buy AI startup Decart at a $7B valuation.",
      "en",
    ],
    [
      "may",
      "Amazon buys AI startup Decart at a $7B valuation",
      "Amazon may buy AI startup Decart at a $7B valuation.",
      "en",
    ],
    [
      "in talks, under agrees",
      "Nvidia agrees to buy Reflection AI",
      "Nvidia is in talks to buy Reflection AI.",
      "en",
    ],
    [
      "lowercase-led name iPhone",
      "Apple brings its Siri AI assistant upgrade to more devices this fall",
      "Apple brings its Siri AI assistant upgrade to iPhone and more devices this fall.",
      "en",
    ],
    [
      "lowercase-led name eBay",
      "OpenAI signs a shopping agent deal with a major online marketplace for checkout",
      "OpenAI signs a shopping agent deal with eBay, a major online marketplace, for checkout.",
      "en",
    ],
    [
      "lowercase-led name xAI",
      "Nvidia invests in a leading AI startup building frontier models for robotics",
      "Nvidia invests in xAI, a leading AI startup building frontier models for robotics.",
      "en",
    ],
    [
      "lowercase-led subject xAI",
      "OpenAI sues Apple over App Store rankings",
      "xAI sues Apple over App Store rankings.",
      "en",
    ],
    [
      "long headline, yesterday",
      decart,
      "Amazon was in talks yesterday to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "long headline, xAI",
      decart,
      "Amazon is in talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic and xAI had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "long headline, eBay",
      decart,
      "Amazon and eBay are in talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "long headline, final talks",
      decart,
      "Amazon is in final talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "long headline, all-cash",
      decart,
      "Amazon is in talks to buy AI startup Decart in an all-cash deal that could value it at ~$7B; Anthropic had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "long headline, ended talks",
      decart,
      "Amazon ended talks to buy AI startup Decart in a deal that could value it at ~$7B; Anthropic had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "long headline, talks collapsed",
      decart,
      "Amazon talks to buy AI startup Decart in a deal that could value it at ~$7B collapsed; Anthropic had decided against acquiring Decart in September.",
      "en",
    ],
    [
      "vi 1.000 added",
      "Meta sa thải nhân viên mảng AI tại Mỹ",
      "Meta sa thải 1.000 nhân viên mảng AI tại Mỹ.",
      "vi",
    ],
    [
      "vi 2.000 under 1.000",
      "Meta sa thải 1.000 nhân viên mảng AI tại Mỹ",
      "Meta sa thải 2.000 nhân viên mảng AI tại Mỹ.",
      "vi",
    ],
    [
      "vi 5 tỷ USD",
      "Anthropic huy động vốn mới do Lightspeed dẫn dắt",
      "Anthropic huy động 5 tỷ USD vốn mới do Lightspeed dẫn dắt.",
      "vi",
    ],
    [
      "vi lần đầu",
      "Nvidia mở văn phòng tại Việt Nam",
      "Nvidia lần đầu mở văn phòng tại Việt Nam.",
      "vi",
    ],
    [
      "vi lần đầu, long headline",
      "Nvidia mở văn phòng nghiên cứu trí tuệ nhân tạo và trung tâm dữ liệu lớn tại Việt Nam",
      "Nvidia lần đầu mở văn phòng nghiên cứu trí tuệ nhân tạo và trung tâm dữ liệu lớn tại Việt Nam.",
      "vi",
    ],
    [
      "vi sẽ",
      "Nvidia mua lại startup mô hình mở Reflection AI",
      "Nvidia sẽ mua lại startup mô hình mở Reflection AI.",
      "vi",
    ],
    [
      "vi có thể",
      "Nvidia mua lại startup mô hình mở Reflection AI",
      "Nvidia có thể mua lại startup mô hình mở Reflection AI.",
      "vi",
    ],
    [
      "vi dự kiến",
      "Nvidia mua lại startup mô hình mở Reflection AI",
      "Nvidia dự kiến mua lại startup mô hình mở Reflection AI.",
      "vi",
    ],
    [
      "vi dự kiến, long headline",
      "Nvidia mua lại startup mô hình mở Reflection AI tại Mỹ để mở rộng đội ngũ nghiên cứu",
      "Nvidia dự kiến mua lại startup mô hình mở Reflection AI tại Mỹ để mở rộng đội ngũ nghiên cứu.",
      "vi",
    ],
    [
      "vi place",
      "Nvidia mở trung tâm nghiên cứu AI mới",
      "Nvidia mở trung tâm nghiên cứu AI mới tại Hà Nội.",
      "vi",
    ],
    [
      "vi date",
      "Nvidia công bố mua lại startup mô hình mở Reflection AI",
      "Nvidia công bố mua lại startup mô hình mở Reflection AI hôm thứ Ba.",
      "vi",
    ],
  ])(
    "keeps a repeat with one changed word: %s",
    (_probe, title, summary, lang) => {
      expect(summaryOf(story({ title, summary, lang }))).toBe(summary);
    }
  );
});
