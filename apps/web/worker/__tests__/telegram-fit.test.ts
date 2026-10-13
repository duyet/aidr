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

  it("shortens a long title at a word boundary", () => {
    const source = "Breaking news about everything ".repeat(30).trim();
    const caption = buildStoryCaption(story({ title: source, summary: "" }));
    const title = (visible(caption).split("\n\n")[0] ?? "").replace("🔥 ", "");
    expect(title.length).toBeLessThanOrEqual(300);
    expect(title.endsWith("…")).toBe(true);
    const kept = title.slice(0, -1);
    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(" ");
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
    const s = story({ summary: "Short and whole." });
    expect(await captionSummaryFor(env, s, budget)).toBeNull();
    expect(completeJson).not.toHaveBeenCalled();
  });

  it("rewrites a summary that fits but reads as feed or press-release copy", async () => {
    // Real VI rows (2026-10): the translation kept an RSS footer, a paper's
    // "we", and a blogger's "you" that the caption then posted verbatim.
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
    // Real EN rewrite (2026-10-13) rejected as Vietnamese for one "é".
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
  // Real Techmeme-style post (2026-10-13): the summary is the headline minus
  // the outlet, so the channel showed the same sentence twice.
  const nvidia = story({
    title:
      "IDC: Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026, as its market share slid to 34% amid US export curbs and rising domestic competition (Reuters)",
    summary:
      "Nvidia's AI chip shipments in China fell 44% YoY to 678K in H1 2026, as its market share slid to 34% amid US export curbs and rising domestic competition.",
    category: "Chips",
  });

  it("drops a summary that only repeats the headline", () => {
    const caption = visible(buildStoryCaption(nvidia));
    expect(caption.split("\n\n")).toEqual([
      `🔥 ${nvidia.title}`,
      "#Chips  ·  ▲ 2",
    ]);
  });

  it("drops the restating lead and keeps the sentences that add facts", () => {
    const s = story({
      title:
        "Nvidia đàm phán mua lại startup mô hình 'mở' Reflection AI tại Mỹ",
      summary:
        "Nvidia đang đàm phán để mua lại Reflection AI, một startup chuyên về mô hình 'mở' tại Mỹ. Thương vụ có thể trị giá 25 tỷ USD.",
      lang: "vi",
    });
    const caption = visible(buildStoryCaption(s));
    expect(caption).not.toContain("Nvidia đang đàm phán");
    expect(caption).toContain("Thương vụ có thể trị giá 25 tỷ USD.");
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
});
