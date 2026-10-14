import { describe, expect, it } from "vitest";
import { highlightBulletText } from "../notify/day-card.js";
import {
  dedupReason,
  eventKey,
  type PostedEvent,
  postability,
  sameEvent,
} from "../notify/post-quality.js";
import { canonicalOf } from "../notify/posted-events.js";
import { sanitizeRunStatsJson } from "../telemetry-safe.js";
import { hasSourceChrome, stripEmbeddedChrome } from "../translation-terms.js";

const GOOD_SUMMARY =
  "Nvidia is in early talks to acquire Reflection AI in a deal that may involve an acqui-hire to avoid full merger review.";

describe("postability", () => {
  it("accepts a plain summary of real length", () => {
    expect(postability({ title: "T", summary: GOOD_SUMMARY })).toEqual({
      ok: true,
    });
  });

  it("rejects a title-only story", () => {
    for (const summary of [null, undefined, "", "   "]) {
      expect(postability({ title: "T", summary })).toEqual({
        ok: false,
        reason: "missing",
      });
    }
  });

  it("rejects a summary that is source chrome, as msg 93 posted it", () => {
    expect(
      postability({
        title: "T",
        summary: `← Back to live feed · 1 stories across 1 day ${GOOD_SUMMARY}`,
      })
    ).toEqual({ ok: false, reason: "chrome" });
  });

  it("rejects the aggregator stub, as msg 89 posted it", () => {
    expect(
      postability({
        title: "T",
        summary: "From Bloomberg. View the full context on Techmeme.",
      })
    ).toEqual({ ok: false, reason: "chrome" });
  });

  it("rejects chrome that sits after the first sentence", () => {
    expect(
      postability({
        title: "T",
        summary: `${GOOD_SUMMARY} View the full context on Techmeme.`,
      })
    ).toEqual({ ok: false, reason: "chrome" });
  });

  it("rejects a stub below the length floor", () => {
    expect(postability({ title: "T", summary: "Raised $5M." })).toEqual({
      ok: false,
      reason: "short",
    });
  });

  it("does not mistake article prose for chrome", () => {
    expect(
      hasSourceChrome("Shares went back to top form after the report.")
    ).toBe(false);
    expect(
      hasSourceChrome("It is a 5 min read about how the context was lost.")
    ).toBe(false);
  });
});

describe("stripEmbeddedChrome", () => {
  it("removes chrome from the middle of a digest line", () => {
    expect(
      stripEmbeddedChrome(
        "Microsoft Launches Decision-1 — ← Back to live feed · 1 stories across 1 day Satya Nadella unveiled a tool."
      )
    ).toBe("Microsoft Launches Decision-1 — Satya Nadella unveiled a tool.");
  });

  it("leaves clean text alone", () => {
    expect(stripEmbeddedChrome("Anthropic bans cruelty toward Claude.")).toBe(
      "Anthropic bans cruelty toward Claude."
    );
  });
});

const ENGLISH = { url: null, sourceLang: null, englishTitle: null };
const VIETNAMESE = { url: null, sourceLang: "vi", englishTitle: null };

describe("sameEvent", () => {
  const key = (title: string) => eventKey(title, ENGLISH);
  const viKey = (title: string) => eventKey(title, VIETNAMESE);

  it("matches one deal reported by two outlets (audit pair, 0.21)", () => {
    expect(
      sameEvent(
        key("Nvidia in talks to acquire US 'open' model startup Reflection AI"),
        key("Nvidia Negotiates $25B Reflection AI Deal to Avoid Antitrust")
      )
    ).toBe(true);
  });

  it("matches the TypeSafe round when both headlines name the round (audit pair, 0.35)", () => {
    expect(
      sameEvent(
        key(
          "Jev developer TypeSafe AI raised ~$870M led by a16z at a $7.5B valuation with Sequoia and others participating (Bloomberg)"
        ),
        key(
          "The maker of non-text AI model Jev valued at $7.5B just weeks after launch, TypeSafe AI raised $870 million in a round led by a16Z"
        )
      )
    ).toBe(true);
  });

  it("keeps two different Nvidia stories apart", () => {
    expect(
      sameEvent(
        key("Nvidia Negotiates $25B Reflection AI Deal to Avoid Antitrust"),
        key(
          "Nvidia, Oracle, CoreWeave, and other AI stocks fell after OpenAI revenue report"
        )
      )
    ).toBe(false);
    expect(
      sameEvent(
        key("Nvidia signs AI chip deal with Saudi Arabia's Humain"),
        key("Nvidia Negotiates $25B Reflection AI Deal to Avoid Antitrust")
      )
    ).toBe(false);
    expect(
      sameEvent(
        key("Nvidia launches Rubin GPU"),
        key("Nvidia stock falls on Rubin delay")
      )
    ).toBe(false);
  });

  it("needs a shared entity, not just shared filler words", () => {
    expect(
      sameEvent(
        key("Startup raises $500M to expand its agent platform worldwide"),
        key("Another startup raises $500M to expand its agent platform")
      )
    ).toBe(false);
  });

  // #756: the English name extractor read "Việt Nam" as "vi" and "nam" and
  // "Quốc" as "qu", so any two headlines naming Việt Nam shared two names.
  it.each([
    [
      "Chuyên gia bày cách để Việt Nam nâng cao năng lực công nghệ",
      "Thứ trưởng Trần Trung Tính: Công nghệ là chìa khóa để Việt Nam vươn ra biển lớn",
    ],
    [
      "Chuyên gia chia sẻ cách để Việt Nam nâng cao năng lực công nghệ",
      "Thứ trưởng Trần Trung Tính: Công nghệ là chìa khóa để Việt Nam vươn ra biển lớn",
    ],
    [
      "Phó thủ tướng Hồ Quốc Dũng: Chuyển từ 'có hoạt động' sang 'có kết quả' đổi mới sáng tạo",
      "Nhiều hoạt động hưởng ứng Ngày Chuyển đổi số Quốc gia 2026",
    ],
  ])("keeps different Vietnamese stories apart: %s / %s", (a, b) => {
    expect(sameEvent(viKey(a), viKey(b))).toBe(false);
  });

  // #756: counted in syllables, two headlines on one prize shared too small
  // a share of their tokens, so a channel could post both.
  it.each([
    [
      "Nhà khoa học đầu tiên 'độc chiếm' giải Nobel Vật lý sau 34 năm",
      "Giải Nobel Vật lý 2026 trao cho nghiên cứu về 'hạt ma'",
    ],
    [
      "Nhà khoa học đầu tiên 'độc chiếm' giải Nobel Vật lý sau 34 năm",
      "Tại sao nghiên cứu về 'hạt ma' đoạt giải Nobel Vật lý?",
    ],
    [
      "Nobel Hóa học 2026 vinh danh nghiên cứu tổng hợp hữu cơ",
      "Hành trình giải mã bí ẩn phân tử của chủ nhân Nobel Hóa học 2026",
    ],
  ])("matches two Vietnamese headlines on one Nobel prize: %s / %s", (a, b) => {
    expect(sameEvent(viKey(a), viKey(b))).toBe(true);
  });

  // #765: one vnexpress article (5128002) and its live page, both published.
  // The headlines share only the topic phrase, so only the id ties them.
  const opening = "Khai mạc Ngày hội Đổi mới sáng tạo Quốc gia 2026";
  const speech =
    "Phó thủ tướng Hồ Quốc Dũng: Chuyển từ 'có hoạt động' sang 'có kết quả' đổi mới sáng tạo";
  const vnexpress = (slug: string) => ({
    url: `https://vnexpress.net/${slug}.html`,
    sourceLang: "vi",
    englishTitle: null,
  });

  it("matches a vnexpress article and its live page on the article id", () => {
    expect(
      sameEvent(
        eventKey(
          opening,
          vnexpress("khai-mac-ngay-hoi-doi-moi-sang-tao-quoc-gia-2026-5128002")
        ),
        eventKey(
          speech,
          vnexpress(
            "khai-mac-ngay-hoi-doi-moi-sang-tao-quoc-gia-2026-5128002-tong-thuat"
          )
        )
      )
    ).toBe(true);
  });

  it("keeps the same two headlines apart under different article ids", () => {
    expect(
      sameEvent(
        eventKey(opening, vnexpress("khai-mac-ngay-hoi-5128002")),
        eventKey(speech, vnexpress("pho-thu-tuong-ho-quoc-dung-5128011"))
      )
    ).toBe(false);
  });

  // #766: "Société Générale" carries Vietnamese-range accents, so the
  // diacritic test read these English headlines as Vietnamese words, where
  // the rewrite scored 0.16 and a channel could post both.
  it("compares an English headline with accented names as English", () => {
    expect(
      sameEvent(
        key("Nvidia and Société Générale team up on AI data centers in France"),
        key(
          "Société Générale partners with Nvidia to build French AI data centers"
        )
      )
    ).toBe(true);
  });

  it.each([
    [
      "Beyoncé deepfake spreads on X as Grok generates explicit images",
      "Grok Generates Explicit Beyoncé Deepfake on X",
    ],
    [
      "Ángel Cabrera named CEO of Mistral",
      "Mistral Names Ángel Cabrera As CEO",
    ],
  ])("reads accented English like its unaccented spelling: %s / %s", (a, b) => {
    const plain = (title: string) =>
      key(title.normalize("NFD").replace(/\p{M}/gu, ""));
    expect(sameEvent(key(a), key(b))).toBe(sameEvent(plain(a), plain(b)));
  });

  it("matches a decomposed (NFD) title against its composed form", () => {
    const a = "Nhà khoa học đầu tiên 'độc chiếm' giải Nobel Vật lý sau 34 năm";
    const b = "Giải Nobel Vật lý 2026 trao cho nghiên cứu về 'hạt ma'";
    expect(sameEvent(viKey(a.normalize("NFD")), viKey(b))).toBe(true);
  });

  // #766: one RegExp per name, each scanning the whole title, is quadratic.
  it("compares two titles of 10,000 names well inside a second", () => {
    const title = `Tin ${Array.from({ length: 10_000 }, (_, i) => `Tên${i}`).join(" ")}`;
    const started = performance.now();
    expect(sameEvent(viKey(title), viKey(title))).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  // #786: a Vietnamese title and an English one share only Latin names, so
  // "Meta", "Muse" and "AI" made these different stories one event and held
  // a post back. Each Vietnamese story carries its vi→en translation, the
  // English copy the channels post.
  const muse = {
    vi: "Cách Meta biến Muse thành 'hiện tượng AI'",
    en: "How Meta Turned Muse Into an 'AI Phenomenon'",
  };
  const youtuber = {
    vi: "YouTuber tố trợ lý AI của Meta dẫn người lạ đến nhà",
    en: "YouTuber says Meta's AI assistant leaked his home address to a stranger",
  };
  const gemini = {
    vi: "Google ra Gemini 4 Argon mạnh nhất của công ty",
    en: "Google Unveils Gemini 4 Argon, the Company's Most Powerful Model",
  };
  const surface = {
    vi: "Microsoft ra Surface Laptop Ultra dùng 'siêu chip' Nvidia",
    en: "Microsoft launches Surface Laptop Ultra powered by Nvidia 'super chip'",
  };
  const viStory = (story: { vi: string; en: string | null }) =>
    eventKey(story.vi, {
      url: null,
      sourceLang: "vi",
      englishTitle: story.en,
    });

  it.each([
    "Meta’s Muse AI sent a YouTuber’s address to a stranger",
    "Meta wants to turn Muse into a moneymaker by selling AI services to businesses",
    "Canaccord Raises Meta Price Target to $950 on Muse AI Growth",
    "All the latest news on Meta’s cute, creepy Muse AI agent",
  ])("keeps a Vietnamese Muse story apart from: %s", (english) => {
    expect(sameEvent(viStory(muse), key(english))).toBe(false);
    expect(sameEvent(key(english), viStory(muse))).toBe(false);
  });

  it.each(
    (
      [
        [youtuber, "Meta’s Muse AI sent a YouTuber’s address to a stranger"],
        [
          gemini,
          "Google releases Gemini 4 Argon, called its most powerful model yet",
        ],
        [gemini, "Google Launches Gemini 4 Argon with 1M Token Output Limit"],
        [
          gemini,
          "Google DeepMind Unveils Gemini 4 Argon with 1M Output Tokens for Coding, Knowledge Work and Cyber Defense",
        ],
        [
          surface,
          "Microsoft Launches $2,599 Surface Laptop Ultra With Local AI Edge Over Apple",
        ],
        [
          surface,
          "Microsoft and Nvidia CEOs Unveil New AI Laptop in San Francisco",
        ],
        [
          surface,
          "Microsoft releases new Nvidia-chip AI PCs with revamped Windows 11",
        ],
      ] satisfies Array<[{ vi: string; en: string }, string]>
    ).map(([story, english]) => [story.vi, story.en, english])
  )(
    "matches a Vietnamese story and its English report: %s (%s) / %s",
    (vi, en, english) => {
      expect(sameEvent(viStory({ vi, en }), key(english))).toBe(true);
    }
  );

  // The vi→en translation can land after the story is published. Until it
  // does, the source titles are compared, and "AI" alone still does not tie
  // them.
  it("compares source titles while a Vietnamese story has no English copy", () => {
    expect(
      sameEvent(
        viStory({ vi: muse.vi, en: null }),
        key("Canaccord Raises Meta Price Target to $950 on Muse AI Growth")
      )
    ).toBe(false);
    expect(
      sameEvent(
        viStory({ vi: gemini.vi, en: null }),
        key("Google Launches Gemini 4 Argon with 1M Token Output Limit")
      )
    ).toBe(true);
  });
});

describe("dedupReason", () => {
  const posted = (
    itemId: string,
    canonicalId: string,
    title: string
  ): PostedEvent => ({
    channelGroup: "telegram-en",
    itemId,
    canonicalId,
    eventKey: eventKey(title, ENGLISH),
    postedAt: 0,
    kind: "trending",
  });
  const candidate = (id: string, canonicalId: string, title: string) => ({
    itemId: id,
    canonicalId,
    eventKey: eventKey(title, ENGLISH),
  });

  it("matches on the shared canonical id first", () => {
    expect(
      dedupReason(candidate("c", "root", "Unrelated headline about robots"), [
        posted("p", "root", "Totally different words about chips"),
      ])
    ).toBe("canonical");
  });

  it("falls back to the event key", () => {
    expect(
      dedupReason(
        candidate(
          "c",
          "c",
          "OpenAI's Navier-Stokes proof: mathematics mistranslated into code"
        ),
        [
          posted(
            "p",
            "p",
            "OpenAI mistranslated mathematics into code for its Navier-Stokes proof"
          ),
        ]
      )
    ).toBe("event");
  });

  it("lets an unrelated story through", () => {
    expect(
      dedupReason(
        candidate("c", "c", "Odyssey-3 is a new generative world model"),
        [posted("p", "p", "Nvidia Negotiates $25B Reflection AI Deal")]
      )
    ).toBeNull();
  });
});

describe("canonicalOf", () => {
  it("follows a duplicate_of chain to its root and survives a cycle", () => {
    const chain = new Map<string, string | null>([
      ["a", "b"],
      ["b", "c"],
      ["c", null],
    ]);
    expect(canonicalOf("a", chain)).toBe("c");
    expect(canonicalOf("c", chain)).toBe("c");
    const cycle = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(["a", "b"]).toContain(canonicalOf("a", cycle));
  });
});

describe("run stats", () => {
  it("keeps suppression counts through the stats sanitizer", () => {
    const stored = JSON.parse(
      sanitizeRunStatsJson(
        JSON.stringify({
          notifyReason: {
            "telegram-en": {
              suppressed: { "dedup:event": 2, "gate:chrome": 1 },
            },
          },
        })
      )
    );
    expect(stored.notifyReason["telegram-en"].suppressed).toEqual({
      "dedup:event": 2,
      "gate:chrome": 1,
    });
  });
});

describe("digest line summary clause", () => {
  it("drops page chrome instead of using it as the clause", () => {
    const item = {
      title: "Microsoft Launches Decision-1 Model to Beat LLM Latency",
      title_vi: null,
      summary:
        "← Back to live feed · 1 stories across 1 day Satya Nadella unveiled a tool for rapid structured decisions.",
      summary_vi: null,
    };
    expect(highlightBulletText(item, "en")).toBe(
      "Microsoft Launches Decision-1 Model to Beat LLM Latency — Satya Nadella unveiled a tool for rapid structured decisions."
    );
  });
});
