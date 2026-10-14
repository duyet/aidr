import { describe, expect, it } from "vitest";
import {
  extractProtectedTerms,
  KEEP_ENGLISH_PROSE,
  KEEP_ENGLISH_TERMS,
  keepVerbatimList,
  missingProtectedTerms,
  stripSourceBoilerplate,
} from "../translation-terms";

describe("protected English terms", () => {
  // Title Case headlines capitalize verbs; the old multi-word entity regex
  // demanded "Armadin Raises" survive and sent faithful rows to human review.
  it("does not treat Title Case verbs as names", () => {
    const { names } = extractProtectedTerms({
      title: "Armadin Raises $255.5M at $2.5B Valuation for AI Cyber Agents",
      summary:
        "A new startup led by Mandiant founder Kevin Mandia has secured a funding round from Accel and a16z. The Series B investment assigns the company, Armadin, a valuation of $2.5B.",
    });
    expect(names).toEqual(expect.arrayContaining(["Armadin", "AI"]));
    expect(names).not.toContain("Raises");
    expect(names).not.toContain("Valuation");
  });

  it("keeps product names and AI jargon, and drops translatable places", () => {
    const terms = extractProtectedTerms({
      title: "OpenAI fine-tunes GPT-5.6 agents on a new benchmark",
      summary:
        "The US lab said the open-weights model uses fewer tokens than Claude.",
    });
    expect(terms.names).toEqual(
      expect.arrayContaining(["OpenAI", "GPT-5.6", "Claude"])
    );
    expect(terms.names).not.toContain("US");
    expect(terms.jargon).toEqual(
      expect.arrayContaining([
        "fine-tun",
        "agent",
        "benchmark",
        "token",
        "open-weight",
      ])
    );
  });

  it("keeps model-type jargon so 'open weight' never becomes 'mở trọng lượng'", () => {
    const { jargon } = extractProtectedTerms({
      title: "Clef: open weight decision model and new RL fine-tuning platform",
      summary: "",
    });
    expect(jargon).toEqual(
      expect.arrayContaining(["open-weight", "decision model", "fine-tun"])
    );
  });

  it("does not demand 'agent' for law-enforcement agents", () => {
    const { jargon } = extractProtectedTerms({
      title:
        "US Arrests California CEO for Smuggling $300M in Servers to China",
      summary: "Federal agents have taken a technology executive into custody.",
    });
    expect(jargon).not.toContain("agent");
  });

  it("reports names and jargon the Vietnamese dropped or calqued", () => {
    // Production row: "AI chatbot" became "Trợ lý ảo" (virtual assistant).
    const missing = missingProtectedTerms(
      {
        title:
          "Musk’s AI chatbot Grok reportedly encouraged Trump to capture  Venezuela’s president",
        summary:
          "President Trump reportedly asked for Grok's opinion before invading Venezuela and capturing Nicolás Maduro.",
      },
      {
        title:
          "Trợ lý ảo Grok của Musk bị cáo buộc đề xuất Trump nên bắt giữ tổng thống Venezuela",
        summary:
          "Theo báo cáo, Tổng thống Trump đã hỏi ý kiến của Grok trước khi xâm lược Venezuela và bắt giữ Nicolás Maduro.",
      }
    );
    expect(missing.names).toEqual(["AI"]);
    expect(missing.jargon).toEqual(["chatbot"]);
  });

  it("accepts plurals, sentence punctuation, and the acronym of a compound", () => {
    const missing = missingProtectedTerms(
      {
        title: "New tool lets users repair AI-generated 3D models",
        summary: "It works with multi-agent pipelines and costs 10 USD.",
      },
      {
        title: "Công cụ mới sửa mô hình 3D do AI tạo ra",
        summary: "Công cụ chạy với pipeline nhiều agent và có giá 10 USD.",
      }
    );
    expect(missing).toEqual({ names: [], jargon: [] });
  });

  it("matches short names as whole words only", () => {
    const missing = missingProtectedTerms(
      { title: "Figma excludes Pi from MCP access", summary: "Figma said so." },
      {
        title: "Figma loại trừ pin khỏi quyền truy cập MCP",
        summary: "Figma nói vậy.",
      }
    );
    expect(missing.names).toEqual(["Pi"]);
  });

  it("strips feed chrome that is not article text", () => {
    expect(
      stripSourceBoilerplate(
        "← Back to live feed · 1 stories across 1 day Consumer card issuers saw fraud fall."
      )
    ).toBe("Consumer card issuers saw fraud fall.");
    expect(
      stripSourceBoilerplate(
        "arXiv:2610.00012v1 Announce Type: new Abstract: LLM agents act."
      )
    ).toBe("LLM agents act.");
  });

  // 403 huggingnews rows stored "← Back to live feed · 1 stories across 1
  // day …" as the English summary, shown verbatim on the story page. The
  // strip must catch other aggregators' nav too, not one exact string.
  it("strips chained page chrome in any order, not one fixed string", () => {
    for (const chrome of [
      "← Back to live feed · 1 stories across 1 day ",
      "Back to all stories | 5 min read · ",
      "‹ Back to news — 3 stories across 2 days ",
      "Skip to content ← Back to the feed ",
    ]) {
      expect(
        stripSourceBoilerplate(`${chrome}Satya Nadella unveiled it.`)
      ).toBe("Satya Nadella unveiled it.");
    }
  });

  // #652: 156 stored summaries ended in a feed footer, and the Vietnamese
  // translator turned it into "Bài viết … xuất hiện lần đầu trên The
  // Decoder." Real tails from each source that sends one.
  it("strips the 'appeared first on' footer feeds append", () => {
    for (const [body, footer] of [
      [
        "Odyssey is making its world model Odyssey-3 available as a public research preview. Odyssey claims top scores on physics benchmarks, though the methodology behind those results has limits.",
        "The article Odyssey-3 is a new generative world model that you can try for free appeared first on The Decoder .",
      ],
      [
        "Gboard already uses it for English and Japanese next-word prediction.",
        "The post Google Research Moves Federated Learning Into TEEs: Gboard Now Trains With Externally Verifiable Differential Privacy appeared first on MarkTechPost .",
      ],
      [
        "It models how individuals may engage with tutors.",
        "The post Simulating student learning for better AI tutoring appeared first on Microsoft Research .",
      ],
      [
        "GitHub’s context-aware secret classifier raises weighted acceptance by 11.5%, and reduces median scan execution time by 86%.",
        "The post GitHub’s model for secret detection: Finding more secrets with less noise appeared first on The GitHub Blog .",
      ],
      [
        'Jordan calls it "grand moralizing performance."',
        'The article Machine learning pioneer Michael I. Jordan dismantles AI doom rhetoric as "grand moralizing performance" appeared first on The Decoder .',
      ],
    ]) {
      expect(stripSourceBoilerplate(`${body} ${footer}`)).toBe(body);
    }
  });

  it("strips only the footer, not article text that resembles it", () => {
    expect(
      stripSourceBoilerplate(
        "The article argues models plateau. The post-training gains hold. The article Models plateau appeared first on The Decoder ."
      )
    ).toBe("The article argues models plateau. The post-training gains hold.");
    for (const text of [
      "The disruptions first appeared on Sept 29, when the company reported elevated error rates.",
      "The post appeared first on Hacker News before it went viral on X.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
  });

  // #662: the tail after "appeared first on" must be the outlet, not prose.
  it("keeps a footer phrase that is quoted or mentioned mid-text", () => {
    for (const text of [
      'Critics said "The post Foo appeared first on The Decoder" was misleading, and the outlet agreed.',
      'Critics called it a lie: "The post Foo appeared first on The Decoder."',
      "The article Foo appeared first on The Decoder . More text follows here.",
      "He noted the post Foo appeared first on The Decoder and moved on.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
  });

  it("strips a footer after an excerpt truncated mid-sentence", () => {
    expect(
      stripSourceBoilerplate(
        "It covers async production workflows The post A Coding Guide to Jev appeared first on MarkTechPost ."
      )
    ).toBe("It covers async production workflows");
  });

  it("strips a footer that is the whole text or follows a closing quote", () => {
    expect(
      stripSourceBoilerplate("The post Foo appeared first on The Decoder.")
    ).toBe("");
    expect(
      stripSourceBoilerplate(
        'He said "no." The post Foo appeared first on The Decoder .'
      )
    ).toBe('He said "no."');
  });

  it("keeps article text that merely looks like chrome", () => {
    for (const text of [
      "3 stories dominated the week: OpenAI shipped.",
      "Microsoft said users can go back to the old feed.",
      "Back to basics: Anthropic trims Claude's prompt.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
  });

  // Production Techmeme rows: the outlet is already in the meta line, and the
  // digest line took "Từ The Information." as its summary clause (#669).
  it("drops a trailing attribution sentence and the Techmeme pointer", () => {
    for (const [text, kept] of [
      ["Từ The Information. Xem toàn bộ ngữ cảnh trên Techmeme.", ""],
      ["Tin từ @openainewsroom. Xem toàn bộ nội dung trên Techmeme.", ""],
      ["Theo Gao Yuan từ Bloomberg. Xem toàn bộ ngữ cảnh trên Techmeme.", ""],
      ["Bởi Maria Curi / Axios. Xem toàn bộ ngữ cảnh trên Techmeme.", ""],
      ["From Bloomberg. View the full context on Techmeme.", ""],
      ["From @openainewsroom.", ""],
      ["By Ina Fried / Axios.", ""],
      ["Nvidia công bố chip mới. Nguồn: Reuters.", "Nvidia công bố chip mới."],
      ["Nvidia ships a new chip. Via @sama.", "Nvidia ships a new chip."],
      ["Chạy tốt trên Qwen. (Nguồn: MarkTechPost)", "Chạy tốt trên Qwen."],
    ] as const) {
      expect(stripSourceBoilerplate(text)).toBe(kept);
    }
  });

  // Production rows the #671 strip missed (#673): a "Tác giả" byline joined
  // by từ/trên, a lowercase word inside the outlet, and "Thông tin từ".
  it("drops the residual Techmeme byline shapes", () => {
    for (const text of [
      // 281ca0f32b
      "Tác giả Sarah Hilton từ Bloomberg. Xem toàn bộ ngữ cảnh trên Techmeme.",
      // 7eea0490cf
      "Tác giả David Pierce trên The Verge. Xem toàn bộ bối cảnh trên Techmeme.",
      // bc1b223920, EN and VI
      "By Brian Krebs / Krebs on Security. View the full context on Techmeme.",
      "Theo Brian Krebs / Krebs on Security. Xem toàn bộ nội dung trên Techmeme.",
      // d415b9354c
      "Thông tin từ Bloomberg. Xem bối cảnh đầy đủ trên Techmeme.",
      // Synthetic: no stored row has it. Techmeme credits a first-party post
      // "(Apple)", and a bare byline would read like this.
      "By Apple.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe("");
    }
  });

  // "Theo" and "Bởi" also open a claim about a country or an institution.
  // Only a source-shaped name after them is an attribution.
  it("keeps a closing Theo or Bởi sentence whose name is not a source", () => {
    for (const text of [
      "Hàn Quốc siết xuất khẩu chip AI sang Trung Quốc. Theo Mỹ.",
      "Nhật Bản tạm dừng thương vụ bán chip cho Huawei. Theo Trung Quốc.",
      "Bộ Thương mại công bố danh sách công ty bị hạn chế. Theo Hoa Kỳ.",
      "Lệnh cấm có hiệu lực từ tuần sau. Theo Nhà Trắng.",
      "Lệnh cấm có hiệu lực từ tuần sau. Bởi Mỹ.",
      "Tác giả huấn luyện một world model quy mô nhỏ theo kiến trúc JEPA trên Pokémon Red.",
      "Nvidia expects the new fab to ship volume parts. By 2030.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
  });

  it("drops a closing Theo sentence that names a source", () => {
    for (const [text, kept] of [
      ["Giá chip tăng 5%. Theo Bloomberg.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Theo Politico.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Theo New York Times.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Theo Janice Huang / Bloomberg.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Theo Gao Yuan từ Bloomberg.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Theo @openainewsroom.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Theo techcrunch.com.", "Giá chip tăng 5%."],
    ] as const) {
      expect(stripSourceBoilerplate(text)).toBe(kept);
    }
  });

  // "Bởi" is also "because", so "Bởi Nvidia thuộc Mỹ." ("because Nvidia is
  // American") is a claim. Every stored Bởi credit is an author byline.
  it("drops a closing Bởi sentence only when it is a byline, handle or domain", () => {
    for (const text of [
      "Lệnh cấm không áp dụng cho chip H20. Bởi Nvidia thuộc Mỹ.",
      "Lệnh cấm có hiệu lực từ tuần sau. Bởi Mỹ từ Trung Quốc.",
      "Công cụ chạy được trên mọi máy chủ. Bởi Node.js.",
      "Ông được chọn là nhân vật của năm. Bởi Time.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
    for (const [text, kept] of [
      ["Giá chip tăng 5%. Bởi Felix Ng / Cointelegraph.", "Giá chip tăng 5%."],
      [
        "Giá chip tăng 5%. Bởi Heather Landi / Fierce Healthcare.",
        "Giá chip tăng 5%.",
      ],
      ["Giá chip tăng 5%. Bởi @openainewsroom.", "Giá chip tăng 5%."],
      ["Giá chip tăng 5%. Bởi techcrunch.com.", "Giá chip tăng 5%."],
    ] as const) {
      expect(stripSourceBoilerplate(text)).toBe(kept);
    }
  });

  // "By" opens a deadline or an adverb as often as a credit. A credit is a
  // known outlet or an author byline.
  it("keeps a closing By sentence that is a date or an adverb", () => {
    for (const fragment of [
      "By Q3 2026.",
      "By December 2026.",
      "By March.",
      "By Contrast.",
      "By Default.",
      "By Then.",
      "By Tuesday's Close.",
      "By AI.",
      "By @sama.",
      "By numpy.org.",
      "By Apple / Google on Android.",
    ]) {
      const text = `Nvidia expects the new fab to ship volume parts. ${fragment}`;
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
    for (const text of [
      "By Bloomberg.",
      "By Donald J. Trump / @realDonaldTrump@truthsocial.com. View the full context on Techmeme.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe("");
    }
  });

  // An outlet keeps a lowercase word ("Krebs on Security") only in an author
  // byline. Elsewhere the word starts a claim.
  it("keeps a credit-led sentence that goes on after the outlet", () => {
    for (const fragment of [
      "From OpenAI / Anthropic on Monday.",
      "Via v1.2.",
      "From gpt-4.1.",
    ]) {
      const text = `The rollout reaches every paid plan. ${fragment}`;
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
    expect(stripSourceBoilerplate("Via theverge.com.")).toBe("");
  });

  it("keeps a sentence that carries a claim or a mid-text từ", () => {
    for (const text of [
      "Theo Reuters, Nvidia sẽ ra chip mới vào tháng 3.",
      "Nvidia đã nhận đơn đặt hàng từ Microsoft. Theo Reuters, giá tăng 5%.",
      "Theo dự báo từ Goldman Sachs...",
      "Chip mới nhận đơn từ Microsoft và Meta.",
      "From Nvidia and Chime to Obvious Ventures, investors piled in.",
      "Tin từ Microsoft cho thấy giá tăng.",
    ]) {
      expect(stripSourceBoilerplate(text)).toBe(text);
    }
  });

  it("demands a kept term verbatim and leaves open-source to Vietnamese", () => {
    const missing = missingProtectedTerms(
      {
        title: "Anthropic fine-tunes an open-source agent",
        summary: "The open-source release beats the benchmark.",
      },
      {
        title: "Anthropic tinh chỉnh một agent",
        summary: "Bản phát hành bỏ qua bài kiểm tra.",
      }
    );
    expect(missing.jargon).toEqual(
      expect.arrayContaining(["fine-tun", "benchmark"])
    );
    expect(missing.jargon).not.toContain("agent");
    expect(missing.jargon.join(" ")).not.toMatch(/open-source/);
    expect(KEEP_ENGLISH_TERMS.join(" ")).not.toMatch(/open-source/);
    expect(KEEP_ENGLISH_PROSE).not.toMatch(/open-source/);
    expect(KEEP_ENGLISH_PROSE).toContain("fine-tune");
  });

  it("gives the generator a readable keep list", () => {
    expect(
      keepVerbatimList({
        title: "Anthropic fine-tunes Claude",
        // A headline's first word is a name only with mid-sentence evidence.
        summary: "The agent from Anthropic beat the benchmark.",
      })
    ).toEqual(
      expect.arrayContaining([
        "Anthropic",
        "Claude",
        "fine-tune",
        "agent",
        "benchmark",
      ])
    );
  });
});
