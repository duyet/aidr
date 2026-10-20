import { describe, expect, it } from "vitest";
import {
  isTitleCaseVi,
  tldrBulletIssues,
  translationDraftIssues,
} from "../translation-draft-check";
import {
  type KnowledgeRule,
  knowledgeViolations,
} from "../translation-knowledge";
import { extractProtectedTerms } from "../translation-terms";

function rule(
  source_term: string,
  bad_vi: string[],
  vi_term: string | null = null
): KnowledgeRule {
  return {
    id: `r-${source_term}`,
    kind: vi_term ? "preferred_term" : "keep_english",
    source_term,
    vi_term,
    bad_vi,
    note: null,
    status: "active",
    hits: 0,
  };
}

// The same rules migration 0045 (and 0038 for agent) seeds in prod.
const RULES = [
  rule("agent", ["đại lý", "đặc vụ"]),
  rule("open-weight", ["mở trọng lượng", "trọng lượng mở"]),
  rule("decision model", ["mô hình quyết định"]),
  rule("white house", ["thế giới trắng"], "Nhà Trắng"),
  rule("governor", ["thống dịch"], "Thống đốc"),
];

const LONG_EN =
  "OpenAI paused training of its next frontier model after new safeguards failed an internal red-team review. The company said the model escaped its sandbox twice during evaluation, and that it will not resume training until an outside lab signs off. Engineers are rebuilding the evaluation harness before any rollout.";

describe("translationDraftIssues", () => {
  // Prod 2026-10-02: "$20B" came back as "20 triệu USD" in the round name.
  it("flags a billion written as triệu", () => {
    const issues = translationDraftIssues(
      {
        title: "Nvidia and SoftBank Deliver Final $20B for OpenAI March Round",
        summary: "",
      },
      {
        title:
          "Nvidia và SoftBank giao nốt 20 triệu USD cho vòng gọi vốn tháng 3 của OpenAI",
        summary: "",
      },
      [],
      true
    );
    expect(issues.join("\n")).toContain('"20 tỷ"');
  });

  // Model sizes are not money; "7B" kept verbatim is correct.
  it("passes model sizes and correct magnitudes", () => {
    expect(
      translationDraftIssues(
        { title: "Marin's 535B Model Raises $1.2B", summary: "" },
        { title: "Mô hình 535B của Marin huy động 1,2 tỷ USD", summary: "" },
        [],
        true
      )
    ).toEqual([]);
  });

  // Prod: "Clef: Mô hình quyết định mở trọng lượng ..." kept "fine-tuning"
  // and "RL" in English, so a keep-list check alone passed it.
  it("flags calques from the knowledge rules", () => {
    const issues = translationDraftIssues(
      {
        title:
          "Clef: Open-weight decision models, and new RL fine-tuning platform",
        summary: "",
      },
      {
        title:
          "Clef: Mô hình quyết định mở trọng lượng và nền tảng fine-tuning RL mới",
        summary: "",
      },
      RULES,
      true
    );
    expect(issues.some((i) => i.includes("mở trọng lượng"))).toBe(true);
    expect(issues.some((i) => i.includes("mô hình quyết định"))).toBe(true);
  });

  // Prod median VI/EN length was 0.42: whole sentences were dropped.
  it("flags a condensed summary and passes a complete one", () => {
    const source = { title: "OpenAI pauses frontier model", summary: LONG_EN };
    const condensed = translationDraftIssues(
      source,
      {
        title: "OpenAI tạm dừng frontier model",
        summary:
          "OpenAI tạm dừng huấn luyện frontier model sau khi red-team phát hiện lỗi sandbox, harness và rollout.",
      },
      [],
      false
    );
    expect(condensed.some((i) => i.includes("do not condense"))).toBe(true);

    const complete = translationDraftIssues(
      source,
      {
        title: "OpenAI tạm dừng frontier model",
        summary:
          "OpenAI tạm dừng huấn luyện frontier model tiếp theo sau khi các biện pháp an toàn mới không vượt qua đợt red-teaming nội bộ. Công ty cho biết mô hình đã hai lần thoát khỏi sandbox trong quá trình đánh giá và sẽ không tiếp tục huấn luyện cho tới khi một phòng thí nghiệm bên ngoài chấp thuận. Các kỹ sư đang xây lại harness đánh giá trước mọi đợt rollout.",
      },
      [],
      false
    );
    expect(complete).toEqual([]);
  });

  // Prod glosses: "tác nhân (agent)", "RAG (Retrieval-Augmented Generation)".
  // A year, a count, a percentage, or a single-token label is not a gloss.
  it("flags a parenthetical English gloss and ignores a year", () => {
    const issues = translationDraftIssues(
      { title: "Story", summary: "Founded then." },
      {
        title: "Tác nhân (agent)",
        summary:
          "Hãng dùng RAG (Retrieval-Augmented Generation). Ra mắt bước (3) năm (2024), tăng (12%). Niêm yết (NYSE), hãng (Anthropic), giá (USD).",
      },
      [],
      false
    );
    expect(issues).toHaveLength(2);
    expect(issues.join("\n")).toContain("(agent)");
    expect(issues.join("\n")).toContain("(Retrieval-Augmented Generation)");
    expect(issues.join("\n")).not.toContain("(2024)");
    expect(issues.join("\n")).not.toContain("(3)");
    expect(issues.join("\n")).not.toContain("(12%)");
    expect(issues.join("\n")).not.toContain("(NYSE)");
    expect(issues.join("\n")).not.toContain("(Anthropic)");
    expect(issues.join("\n")).not.toContain("(USD)");
  });

  // All-lowercase glosses and acronym expansions still fail. A Title Case
  // name after an ordinary word is the name, not a gloss.
  it("flags a lowercase gloss and an acronym expansion, not a proper name", () => {
    const issues = translationDraftIssues(
      { title: "Story", summary: "The swarm failed at the congress." },
      {
        title: "Thử nghiệm bầy (swarm) cho thấy chúng phối hợp lỗi",
        summary:
          "đa tác nhân (multi-agent). CCC (Chaos Communication Congress). thành phố (New York), bang (New South Wales), chip (Blackwell Ultra), công cụ (Claude Code), vòng (Series A), báo (The Verge), luật (CHIPS Act), đạo luật (EU AI Act), CEO (Sam Altman). mô hình mở và đại lý.",
      },
      [],
      false
    );
    expect(issues).toEqual([
      `"bầy (swarm)" is a parenthetical English gloss; drop the gloss and keep one term`,
      `"nhân (multi-agent)" is a parenthetical English gloss; drop the gloss and keep one term`,
      `"CCC (Chaos Communication Congress)" is a parenthetical English gloss; drop the gloss and keep one term`,
    ]);
  });

  // Prod 1e7f081e copied the paper's own "SERA (Self-Evaluating Recursive
  // Agents)"; prod c4bfc91a numbered a list "(i) … và (ii)". Neither is a
  // gloss the translator added, so neither is a repair or a refused post.
  it("does not flag a gloss the source writes or a list marker", () => {
    const glosses = (source: string, vi: string) =>
      translationDraftIssues(
        { title: "Self-Evaluating Recursive Agents", summary: source },
        { title: "Các agent đệ quy tự đánh giá", summary: vi },
        [],
        false
      ).filter((issue) => issue.includes("gloss"));
    expect(
      glosses(
        "SERA (Self-Evaluating Recursive Agents) turns evaluation into a learned capability.",
        "SERA (Self-Evaluating Recursive Agents) biến việc đánh giá thành một khả năng được học."
      )
    ).toEqual([]);
    expect(
      glosses(
        "(i) a base station broadcasts the weights, and (ii) edge users receive them.",
        "(i) trạm phát sóng trọng số, và (ii) người dùng biên nhận trọng số."
      )
    ).toEqual([]);
    expect(
      glosses(
        "SERA turns evaluation into a learned capability.",
        "SERA (Self-Evaluating Recursive Agents) biến việc đánh giá thành một khả năng được học."
      )
    ).toHaveLength(1);
  });

  it("asks for kept jargon the draft translated away", () => {
    const issues = translationDraftIssues(
      { title: "OpenAI pauses frontier model", summary: LONG_EN },
      {
        title: "OpenAI tạm dừng mô hình tiên phong",
        summary:
          "OpenAI tạm dừng huấn luyện mô hình tiên phong tiếp theo sau khi các biện pháp an toàn mới không vượt qua đợt kiểm thử tấn công nội bộ. Công ty cho biết mô hình đã hai lần thoát khỏi môi trường cách ly trong quá trình đánh giá và sẽ không tiếp tục huấn luyện cho tới khi một phòng thí nghiệm bên ngoài chấp thuận. Các kỹ sư đang xây lại bộ khung đánh giá trước mọi đợt triển khai.",
      },
      [],
      false
    );
    expect(issues[0]).toContain("frontier model");
    expect(issues[0]).toContain("sandbox");
    expect(issues[0]).toContain("harness");
  });
});

describe("isTitleCaseVi", () => {
  // Real prod titles the review marked title_case.
  it.each([
    [
      "Nscale Raises $3.36B in Convertible Notes Before NYSE IPO",
      "Nscale Huy Động 3,36 Tỷ USD Trước Khi Niêm Yết Trên NYSE",
    ],
    [
      "China May Clear ByteDance and Alibaba to Buy New Nvidia Chips",
      "Trung Quốc Có Thể Phê Chuẩn ByteDance Và Alibaba Mua Chip Nvidia Mới",
    ],
    [
      "LLM Policies: Progress At All Costs",
      "LLM Policies: Tiến Bộ Bằng Mọi Giá",
    ],
  ])("flags %s", (en, vi) => {
    expect(isTitleCaseVi(vi, en)).toBe(true);
  });

  // Vietnamese proper names are capitalized in sentence case too.
  it.each([
    [
      "Trump Hosts Anthropic CEO for White House Dinner",
      "Trump mời CEO Anthropic dự bữa tối tại Nhà Trắng",
    ],
    ["Australian Senate Summons Altman", "Thượng viện Úc triệu tập Altman"],
    [
      "US and Russia Block AI Safeguards Sought by 70 UN Nations",
      "Mỹ và Nga chặn các biện pháp an toàn AI mà 70 quốc gia Liên Hợp Quốc đề xuất",
    ],
    [
      "Trump Rejects Global AI Governance for Justice Department Oversight",
      "Trump bác bỏ quản trị AI toàn cầu, chọn giám sát của Bộ Tư pháp Hoa Kỳ",
    ],
    [
      "OpenAI Agents Leak 53 User Images to External Sites",
      "OpenAI Agents rò rỉ 53 ảnh người dùng ra các trang web bên ngoài",
    ],
    // Capitals here are the institution. The verb is already lowercase.
    ["US Justice Department sues OpenAI", "Bộ Tư pháp Hoa Kỳ kiện OpenAI"],
    ["US Supreme Court hears OpenAI", "Tòa án Tối cao Hoa Kỳ xử OpenAI"],
    ["SEC fines Goldman", "Ủy ban Chứng khoán Hoa Kỳ phạt Goldman"],
    [
      "Hanoi University of Science and Technology opens an AI lab",
      "Đại học Bách khoa Hà Nội mở lab AI",
    ],
  ])("passes %s", (en, vi) => {
    expect(isTitleCaseVi(vi, en)).toBe(false);
  });
});

describe("avoid rules count per occurrence", () => {
  const pair = (source: string, candidate: string) => ({
    source: { title: source, summary: "" },
    candidate: { title: candidate, summary: "" },
    sourceLang: "en" as const,
    targetLang: "vi" as const,
    direction: "en-vi" as const,
  });

  // Keeping "agent" once must not excuse a calque of the second mention.
  it("fails 'đại lý' even when 'agent' also appears", () => {
    expect(
      knowledgeViolations(
        pair(
          "OpenAI agents leak data; the agents hid stolen credentials",
          "Agent của OpenAI làm lộ dữ liệu; các đại lý giấu thông tin đăng nhập bị đánh cắp"
        ),
        RULES
      )
    ).toHaveLength(1);
  });

  // "FBI agents" are people: "đặc vụ FBI" is the right translation.
  it("allows 'đặc vụ' for each non-AI agent in the source", () => {
    expect(
      knowledgeViolations(
        pair(
          "FBI agents raid startup that sold AI agents",
          "Đặc vụ FBI khám xét startup bán AI agent"
        ),
        RULES
      )
    ).toEqual([]);
    expect(
      knowledgeViolations(
        pair(
          "FBI agents raid startup that sold AI agents",
          "Đặc vụ FBI khám xét startup bán đặc vụ AI"
        ),
        RULES
      )
    ).toHaveLength(1);
  });
});

describe("tldrBulletIssues", () => {
  it("flags magnitude and calques in a VI bullet", () => {
    const issues = tldrBulletIssues(
      "Trump Hosts Anthropic CEO for White House Dinner\nAnthropic raised $30B.",
      "Trump mời CEO Anthropic tới Thế Giới Trắng; Anthropic vừa gọi 30 triệu USD.",
      RULES
    );
    expect(issues).toHaveLength(2);
  });

  it("flags a parenthetical gloss in a VI bullet and keeps a place name", () => {
    const issues = tldrBulletIssues(
      "A swarm of agents failed in New York.",
      "Thử nghiệm bầy (swarm) tại thành phố (New York) cho thấy chúng phối hợp lỗi.",
      []
    );
    expect(issues).toEqual([
      `"bầy (swarm)" is a parenthetical English gloss; drop the gloss and keep one term`,
    ]);
  });

  // Prod 2026-10-08: both shipped because no check saw the doubled word.
  it("flags a doubled Vietnamese word so the bullet gets a repair", () => {
    expect(
      tldrBulletIssues(
        "Meta pulled out of the acquisition deal.",
        "Meta rút lui khỏi thỏa thỏa thuận mua lại.",
        []
      )
    ).toEqual([`"thỏa thỏa" repeats a word; write "thỏa" once`]);
  });

  it("does not flag reduplication, English names, or a single word", () => {
    expect(
      tldrBulletIssues(
        "People are slowly adopting Bora Bora tools.",
        "Người người từ từ dùng công cụ Bora Bora.",
        []
      )
    ).toEqual([]);
  });
});

describe("stutter check and compound words", () => {
  const stutters = (vi: string) =>
    tldrBulletIssues("An AI news story.", vi, []).filter((issue) =>
      issue.includes("repeats a word")
    );

  // Stored translations the Vietnamese Telegram gate refused in the 14 days
  // to 2026-10-20 (scripts/telegram-gate-replay.ts). Each doubled syllable
  // ends one word and starts the next, so the sentence is correct.
  it.each([
    [
      "b639c583",
      "Các tác giả của một benchmark vật lý lý thuyết đã sửa lại đáp án chuẩn.",
    ],
    [
      "e2a62c45",
      "Dyson ngừng bán bàn chải AI giá 500 USD sau khi thiết bị bị lỗi.",
    ],
    [
      "ae6e4921",
      "Chúng tôi đánh giá HybridAgent ở 3 quy mô mô hình trên 11 benchmark.",
    ],
    [
      "14e5315c",
      "Các mô hình hình ảnh mới nhất từ OpenAI và Google dễ bị jailbreak hơn.",
    ],
    [
      "cc19c646",
      "Các công ty không nên thử nghiệm các bài toán toán học nâng cao.",
    ],
    [
      "c75409a9",
      "Mô hình định điều kiện khung hình đầu và cuối cùng cùng đầu vào âm thanh.",
    ],
    [
      "6b6ee068",
      "Đây là giai đoạn đầu tư tư nhân cuối cùng trước khi lên sàn.",
    ],
  ])("does not flag %s, two words sharing a syllable", (_id, vi) => {
    expect(stutters(vi)).toEqual([]);
  });

  // The same stories' real stutters: a copy that belongs to neither
  // neighbour is a generation glitch the repair must remove.
  it.each([
    [
      "d70fece5",
      "Triển vọng dựa trên nguồn cung hẹp hẹp cho hạ tầng AI.",
      "hẹp",
    ],
    [
      "5bc6764d",
      "Người dùng cho rằng thuật ngữ này giấu giấu một vụ rò rỉ.",
      "giấu",
    ],
    [
      "7454dac9",
      "Mức tăng lớn nhất kể từ khi Cục Thống thống Lao động theo dõi.",
      "Thống",
    ],
    [
      "265a5629",
      "TypeSafe ra mắt Jev 1.14 với nâng cấp đa dạng dạng và đa ngôn ngữ.",
      "dạng",
    ],
    ["5633ac08", "Điều này có thể dẫn đến sự tránh tránh thuật toán.", "tránh"],
    ["held out", "Công ty đưa ra các biện biện pháp an toàn mới.", "biện"],
  ])("flags %s", (_id, vi, word) => {
    expect(stutters(vi)).toEqual([
      expect.stringContaining(`write "${word}" once`),
    ]);
  });
});

describe("translationDraftIssues stutter", () => {
  it("flags a doubled magnitude word in a title", () => {
    const issues = translationDraftIssues(
      { title: "Hone raises $60M seed at a $285M valuation", summary: "" },
      {
        title:
          "Hone huy động 60 triệu USD vòng seed với định giá 285 triệu triệu USD",
        summary: "",
      },
      [],
      true
    );
    expect(issues).toContain(
      `"triệu triệu" repeats a word; write "triệu" once`
    );
  });
});

describe("keep-English terms in their ordinary English sense", () => {
  const jargon = (source: string) =>
    extractProtectedTerms({ title: "", summary: source }).jargon;

  // Source lines of stories the Vietnamese Telegram gate refused in the 14
  // days to 2026-10-20 for "keep these terms in English" although the term
  // was the plain verb, which the Vietnamese rightly translated.
  it.each([
    [
      "38814028",
      "To make it computationally practical, we exploit the backbone's causal structure.",
      "exploit",
    ],
    [
      "b34ad4f9",
      "How threat actors select targets, direct autonomous agents, exploit vulnerabilities, and expose secrets.",
      "exploit",
    ],
    [
      "2248a66d",
      "A lack of safeguards allows criminals to exploit increasingly powerful AI tools.",
      "exploit",
    ],
    [
      "f5987825",
      "We develop a matrix multiplication engine that exploits this property.",
      "exploit",
    ],
    [
      "739162d7",
      "Yelp is embedding numerous new AI features into its app.",
      "embedding",
    ],
    [
      "9eceb514",
      "The method is on the leaderboard after embedding 24,576 fingerprints in Llama-3.1-8B.",
      "embedding",
    ],
    [
      "b6799858",
      "The fallout has prompted some mathematics students to question the field.",
      "prompt",
    ],
    [
      "d3f037bc",
      "Muse Wonder Full and the anticipated launch of Gemini 4, prompting speculation about the deployment.",
      "prompt",
    ],
  ])("does not ask %s to keep a verb in English", (_id, source, term) => {
    expect(jargon(source)).not.toContain(term);
  });

  it("still asks to keep the jargon nouns", () => {
    expect(jargon("A zero-day exploit hit the eval harness.")).toContain(
      "exploit"
    );
    expect(jargon("The new text embeddings beat OpenAI.")).toContain(
      "embedding"
    );
    expect(
      jargon("We compare few-shot prompting with JSON prompts.")
    ).toContain("prompt");
    expect(jargon("Attackers used the exploit chain twice.")).toContain(
      "exploit"
    );
    // Held-out b6437fe6, 26128afc: a headline noun followed by the summary's
    // first word, and a model name, are not verbs.
    expect(
      extractProtectedTerms({
        title: "CVSS 9.8 Bug in First Potential Autonomous AI Agent Exploit",
        summary: "The flaw allows remote code execution.",
      }).jargon
    ).toContain("exploit");
    expect(jargon("It beats Gemini Embedding 2 on retrieval.")).toContain(
      "embedding"
    );
  });

  // Prod 4be1348a, de25b1e6: "các mô hình frontier" keeps the English term in
  // Vietnamese word order; "các mô hình tiên phong" does not.
  it("accepts a kept term in Vietnamese word order", () => {
    const source = {
      title: "US Restores UK Access to Unreleased AI Models",
      summary:
        "The AISI may again review frontier models from Google and OpenAI.",
    };
    const issues = (vi: string) =>
      translationDraftIssues(
        source,
        {
          title:
            "Mỹ khôi phục quyền truy cập của UK vào các mô hình AI chưa phát hành",
          summary: vi,
        },
        [],
        false
      ).filter((issue) => issue.startsWith("keep these terms"));
    expect(
      issues(
        "AISI có thể xem xét lại các mô hình frontier của Google và OpenAI."
      )
    ).toEqual([]);
    expect(
      issues(
        "AISI có thể xem xét lại các mô hình mạnh nhất của Google và OpenAI."
      )
    ).toEqual(["keep these terms in English: frontier model"]);
  });
});

describe("new keep-English terms", () => {
  // "harnessing" and "exploited" are ordinary verbs a journalist translates.
  it("matches harness and exploit only as whole words", () => {
    expect(
      extractProtectedTerms({
        title: "Labs harnessing compute exploited a loophole",
        summary: "",
      }).jargon
    ).toEqual([]);
    expect(
      extractProtectedTerms({
        title: "New eval harness catches a zero-day exploit",
        summary: "",
      }).jargon
    ).toEqual(expect.arrayContaining(["harness", "exploit"]));
  });

  it("matches red-teaming, kill switches and hyperscalers", () => {
    expect(
      extractProtectedTerms({
        title:
          "NYC bill adds kill switches after red team tests at hyperscalers",
        summary: "",
      }).jargon
    ).toEqual(
      expect.arrayContaining(["kill switch", "red-team", "hyperscaler"])
    );
  });
});

describe("translationDraftIssues English echo", () => {
  // Prod 2026-10-14, item 8eb3e0ba (#2 of the 2026-10-15 edition): Laguna
  // returned the English title and summary as the Vietnamese row.
  const BANKS = {
    title:
      "Banks are now trying to offload the AI data center debt they just underwrote",
    summary:
      "Banks including JPMorgan and MUFG are shopping AI data center debt tied to Oracle as credit default swaps spike and bond order books thin out.",
  };

  it("flags a draft that is the English source unchanged, title included", () => {
    expect(translationDraftIssues(BANKS, BANKS, [], false)).toEqual([
      "the title and summary are still the English source; translate both into Vietnamese",
    ]);
  });

  // Prod 2026-10-11, item 1af7ebf2: only "for" became "cho".
  it("flags an English summary under a Vietnamese title", () => {
    const issues = translationDraftIssues(
      {
        title: "JulianFlux: Electrodynamic vector retrieval for AI",
        summary:
          "Electrodynamic field retrieval and causal routing for AI agents. - julianjohnson-web/julianflux-research",
      },
      {
        title: "JulianFlux: truy xuất vector điện động lực học cho AI",
        summary:
          "Electrodynamic field retrieval and causal routing cho AI agent. - julianjohnson-web/julianflux-research",
      },
      [],
      false
    );
    expect(issues).toEqual([
      "the summary is still English; translate it into Vietnamese",
    ]);
  });

  it("passes the Vietnamese translation of the same story", () => {
    const issues = translationDraftIssues(
      BANKS,
      {
        title:
          "Các ngân hàng đang tìm cách bán bớt khoản nợ trung tâm dữ liệu AI mà chính họ vừa bảo lãnh",
        summary:
          "Các ngân hàng, trong đó có JPMorgan và MUFG, đang chào bán khoản nợ trung tâm dữ liệu AI gắn với Oracle khi phí hoán đổi rủi ro tín dụng tăng vọt và sổ lệnh trái phiếu mỏng dần.",
      },
      [],
      false
    );
    expect(issues).toEqual([]);
  });

  // Prod rows the owner triaged as fine: a paper or package name kept as
  // the title over a Vietnamese summary, and a feed "summary" that is only
  // a name. Neither may cost a repair call.
  it("passes a kept paper or package title over a Vietnamese summary", () => {
    const dosa = translationDraftIssues(
      {
        title: "DoSA: Dots Sparse Attention",
        summary:
          "Sparse attention visits few keys, yet finding them can still require scoring every key with every indexer head.",
      },
      {
        title: "DoSA: Dots Sparse Attention",
        summary:
          "Sparse Attention chỉ truy cập vào ít key, nhưng việc tìm kiếm chúng vẫn có thể yêu cầu tính điểm mọi key với mọi indexer head.",
      },
      [],
      false
    );
    expect(dosa).toEqual([]);

    const phyProbe = translationDraftIssues(
      {
        title:
          "PhyProbe: Rethinking Physical Consistency Evaluation in Generated Videos",
        summary:
          "Evaluating the physical consistency of generated videos remains a fundamental challenge.",
      },
      {
        title:
          "PhyProbe: Rethinking Physical Consistency Evaluation in Generated Videos",
        summary:
          "Đánh giá tính nhất quán vật lý của video được tạo ra vẫn là một thách thức cơ bản.",
      },
      [],
      false
    );
    expect(phyProbe).toEqual([]);

    const release = translationDraftIssues(
      { title: "llm-gemini 0.35", summary: "" },
      { title: "llm-gemini 0.35", summary: "" },
      [],
      true
    );
    expect(release).toEqual([]);
  });

  it("passes a name-only summary kept as written", () => {
    const issues = translationDraftIssues(
      {
        title:
          "Putting Earth AI to work: Geospatial agents for our planet's biggest challenges",
        summary: "Earth AI",
      },
      {
        title:
          "Đưa Earth AI vào thực tiễn: Các agent địa phương cho những thách thức lớn nhất của hành tinh",
        summary: "Earth AI",
      },
      [],
      false
    );
    expect(issues).toEqual([]);
  });
});

describe("translationDraftIssues version numbers", () => {
  const titleOnly = (source: string, vi: string) =>
    translationDraftIssues(
      { title: source, summary: "" },
      { title: vi, summary: "" },
      [],
      true
    );

  // Prod 2026-09-02, item c4c7ba8f (#781): an HN title with no summary, so
  // the title is all a Vietnamese reader sees.
  it("flags a title that changes the model version", () => {
    expect(titleOnly("Gemini 3.8 Flash", "Gemini 1.5 Flash")).toEqual([
      'keep "Gemini 3.8" as the source writes it, not "Gemini 1.5"',
    ]);
  });

  // Prod rows found by the same scan over every VI translation.
  it("flags a model id or product number swapped for another", () => {
    expect(
      titleOnly(
        "OpenAI begins rolling out GPT-6 Astra",
        "OpenAI bắt đầu triển khai GPT-4o Astra"
      )
    ).toEqual(['keep "GPT-6" as the source writes it, not "GPT-4o"']);
    expect(
      titleOnly(
        "SpaceX Targets 250kW Average Power for VR72 With Nvidia",
        "SpaceX hợp tác cùng Nvidia phát triển VR70 đạt 250kW"
      )
    ).toEqual(['keep "VR72" as the source writes it, not "VR70"']);
    expect(
      titleOnly(
        "Qwen 3.8 27B available on Cerebras at 1500 tok/SEC",
        "Cerebras hỗ trợ Qwen 2.5 27B với tốc độ 1.500 token/giây"
      )
    ).toEqual(['keep "Qwen 3.8" as the source writes it, not "Qwen 2.5"']);
  });

  it("flags a title that drops a dotted version", () => {
    expect(
      titleOnly(
        "Z.ai Reveals Ox Alpha as GLM-5.3-Flash, Biggest Model Yet on OpenRouter",
        "Z.ai ra mắt Ox Alpha, mô hình lớn nhất trên OpenRouter"
      )
    ).toEqual(['the title drops "GLM-5.3"; keep the name and its version']);
  });

  it("flags a summary that swaps a version", () => {
    const issues = translationDraftIssues(
      {
        title: "Scrimshaw Jukebox",
        summary:
          "I wanted to see if Claude Opus 5.5 could compose music, so I asked it for video game music.",
      },
      {
        title: "Scrimshaw Jukebox",
        summary:
          "Tôi muốn xem Claude Opus 4.5 có sáng tác nhạc được không nên đã nhờ nó viết nhạc trò chơi điện tử.",
      },
      [],
      false
    );
    expect(issues).toEqual([
      'keep "Opus 5.5" as the source writes it, not "Opus 4.5"',
    ]);
  });

  // Conversions the prompt asks for, and prod titles that read correctly.
  // None may cost a repair call.
  it("passes money, counts, percentages and magnitudes in Vietnamese form", () => {
    const pairs: [string, string][] = [
      [
        "OpenAI Commits $200B to US Data Centers",
        "OpenAI cam kết chi 200 tỷ USD cho trung tâm dữ liệu Mỹ",
      ],
      ["Meta Hires 1,000 AI Engineers", "Meta tuyển 1.000 kỹ sư AI"],
      [
        "Salesforce Shares Jump 15% on AI Demand",
        "Cổ phiếu Salesforce tăng 15% nhờ nhu cầu AI",
      ],
      [
        "AI Data Center Debt Could Reach 1 trillion Dollars",
        "Nợ trung tâm dữ liệu AI có thể đạt 1 nghìn tỷ USD",
      ],
      [
        "OpenAI Sets $1.4T Valuation for New $30B Fundraise",
        "OpenAI định giá 1.400 tỷ USD cho đợt gọi vốn mới trị giá 30 tỷ USD",
      ],
      [
        "Anthropic Revenue Surpasses OpenAI for First Time With $11.6 Billion in Q2",
        "Doanh thu của Anthropic lần đầu vượt qua OpenAI với 11,6 tỷ USD trong quý 2",
      ],
      [
        "Dell Raises FY27 Revenue Guide to $192 Billion on $95 Billion AI Backlog",
        "Dell nâng dự báo doanh thu năm tài chính 2027 lên 192 tỷ USD",
      ],
      [
        "Foxconn Beats Q3 Revenue Forecasts With 47.1% Growth",
        "Foxconn vượt dự báo doanh thu quý 3 với mức tăng trưởng 47,1%",
      ],
      [
        "OpenAI's First Custom AI Chip Beats Nvidia GB300 by 1.9x on Power Efficiency",
        "Chip AI tùy chỉnh đầu tiên của OpenAI vượt mặt Nvidia GB300 về hiệu suất năng lượng",
      ],
      [
        "Horizon TACC Receives 4,000 GB200s for Largest Academic Supercomputer",
        "Horizon TACC trở thành siêu máy tính học thuật lớn nhất nhờ 4.000 chip GB200",
      ],
      [
        "Run Qwen 3.8 Flash Next (125B) on consumer hardware (RTX 4090) at 100T/s",
        "Chạy Qwen3.8-Flash-Next (125B) trên phần cứng phổ thông (RTX 4090) đạt tốc độ 100T/s",
      ],
      [
        "ABC-130K Tops All Open Teleop Datasets With 130,000 Episodes",
        "abc-130k đứng đầu mọi open teleop dataset với 130.000 episode",
      ],
      [
        "Vercel Open Sources 6.3MB Coding Agent 20 Times Smaller Than Major CLIs",
        "Vercel mã nguồn mở coding agent 6,3MB, nhỏ hơn 20 lần so với các CLI phổ biến",
      ],
      ["llm-gemini 0.35", "llm-gemini 0.35"],
    ];
    for (const [source, vi] of pairs) {
      expect(titleOnly(source, vi), source).toEqual([]);
    }
  });

  // Prod 5a022d30: the headline is shorter, and the summary keeps GPT-5.6.
  it("passes a shortened title when the summary keeps the version", () => {
    const issues = translationDraftIssues(
      {
        title:
          "SpaceXAI Launches Grok 4.7 With 19.6% Legal Benchmark Score to Beat GPT 5.6",
        summary:
          "The new AI model is available via Grok Build, Cursor, and API for developers specializing in coding and knowledge work. SpaceXAI's latest release scored 19.6% on the Harvey Legal Agent Benchmark, outperforming GPT-5.6 Sol Max at 2.5% and Fable 5.1 Max at 6.7%. The model also reached 38.0% on Terminal-Bench 4.0 compared to 20.3% for Grok 4.6, while headline pricing remains at $2 per 1 million input tokens and $6 per 1 million output tokens.",
      },
      {
        title:
          "SpaceXAI ra mắt Grok 4.7, đạt 19,6% trên benchmark pháp lý Harvey",
        summary:
          "Mô hình AI mới đã có trên Grok Build, Cursor và API, hướng tới lập trình viên và chuyên gia tri thức. Trên Harvey Legal Agent Benchmark, Grok 4.7 đạt 19,6%, vượt trội so với GPT-5.6 Sol Max (2,5%) và Fable 5.1 Max (6,7%). Trên Terminal-Bench 4.0, mô hình đạt 38,0% so với 20,3% của Grok 4.6. Giá cả vẫn giữ ở mức 2 USD cho 1 triệu token đầu vào và 6 USD cho 1 triệu token đầu ra.",
      },
      [],
      false
    );
    expect(issues).toEqual([]);
  });

  // Prod 41eeccef: the title says 0.6.0, the summary 0.6.
  it("passes a version the summary writes the way the title does", () => {
    const issues = translationDraftIssues(
      {
        title:
          "LangChain Automates Slack Provisioning in Managed Deep Agents 0.6.0",
        summary:
          "Deep Agents 0.6 now provisions Slack apps without manual OAuth.",
      },
      {
        title:
          "LangChain tự động hóa việc cấp quyền Slack trong Managed Deep Agents 0.6.0",
        summary:
          "Deep Agents 0.6.0 giờ tự cấp phép ứng dụng Slack mà không cần thiết lập OAuth thủ công.",
      },
      [],
      false
    );
    expect(issues).toEqual([]);
  });
});

// Prod 8e8bf17f (2026-10-19): the English source as stored. The owner's
// Telegram screenshot showed "gia đình" (a household) for "model family".
const TIMESTRAL_EN = {
  title:
    "Mistral AI Releases Timestral: A 209M Forecasting Model Family That Outperforms Google’s TimesFM-3",
  summary:
    "Mistral released Timestral, a time series foundation model family ranging from 5M to 209M parameters, with the 209M model leading GIFT-Eval, TIME and fev-bench among zero-shot models and running on CPU.",
};
const TIMESTRAL_VI_SUMMARY_TAIL =
  "Mô hình 209M dẫn đầu GIFT-Eval, TIME và fev-bench trong số các mô hình zero-shot và chạy trên CPU.";

// Prod 7beb3e30 (2026-10-19): sentences of the arXiv abstract.
const ASTRA_EN = {
  title: "Has GPT-6-Astra Achieved Embodied Intelligence?",
  summary:
    "GPT-6-Astra demonstrates a level of competence in robotic manipulation and navigation that challenges the conventional paradigm of building specialized models for individual tasks and embodiments. We conduct a large-scale evaluation across 12 representative benchmarks spanning tabletop manipulation, humanoids, mobile platforms, and dexterous hands. Future research may focus on improving 1) the generality of ICL 2) cost and execution time, 3) physical-state verification, 4) recovery from irreversible failures, and 5) long-horizon preservation of progress.",
};
const astraVi = (title: string, spanning: string, generality: string) => ({
  title,
  summary: `GPT-6-Astra cho thấy năng lực thao tác robot và điều hướng đủ để thách thức mô hình quen thuộc là xây dựng các model chuyên biệt cho từng tác vụ và từng dạng robot. Nhóm đánh giá trên 12 benchmark tiêu biểu, gồm ${spanning}. Nghiên cứu tiếp theo có thể tập trung cải thiện 1) ${generality} của ICL, 2) chi phí và thời gian thực thi, 3) xác minh trạng thái vật lý, 4) phục hồi sau các thất bại không thể đảo ngược, và 5) giữ tiến độ trong tác vụ dài hạn.`,
});

describe("translationDraftIssues model family", () => {
  it("flags 'gia đình' for a model family in the title and the summary", () => {
    const issues = translationDraftIssues(
      TIMESTRAL_EN,
      {
        title: "Mistral AI ra mắt Timestral: gia đình mô hình dự báo 209M",
        summary: `Mistral ra mắt Timestral, một gia đình foundation model chuỗi thời gian từ 5M đến 209M tham số. ${TIMESTRAL_VI_SUMMARY_TAIL}`,
      },
      [],
      false
    );
    expect(issues).toContain("keep these terms in English: model family");
    expect(issues).toContain(
      `"model family" must not be rendered as "gia đình mô hình" or "gia đình foundation model"; use "model family"`
    );
  });

  // The keep check passes once any field says "model family"; only the
  // calque check sees the title.
  it("flags a calqued title when the summary keeps the term", () => {
    const issues = translationDraftIssues(
      TIMESTRAL_EN,
      {
        title: "Mistral AI ra mắt Timestral: họ mô hình dự báo 209M",
        summary: `Mistral ra mắt Timestral, một time series foundation model family từ 5M đến 209M tham số. ${TIMESTRAL_VI_SUMMARY_TAIL}`,
      },
      [],
      false
    );
    expect(issues).toEqual([
      `"model family" must not be rendered as "họ mô hình"; use "model family"`,
    ]);
  });

  it("passes the stored translation that keeps model family", () => {
    expect(
      translationDraftIssues(
        TIMESTRAL_EN,
        {
          title:
            "Mistral AI ra mắt Timestral: model family dự báo 209M vượt Google TimesFM-3",
          summary: `Mistral ra mắt Timestral, một time series foundation model family từ 5M đến 209M tham số. ${TIMESTRAL_VI_SUMMARY_TAIL}`,
        },
        [],
        false
      )
    ).toEqual([]);
  });

  it("does not read 'họ mô hình hóa' (they model) as a calque", () => {
    expect(
      tldrBulletIssues(
        "Researchers model the family of reasoning models as one system.",
        "Họ mô hình hóa model family reasoning model như một hệ thống.",
        []
      )
    ).toEqual([]);
  });

  // Live TL;DR bullet on 2026-10-19.
  it("flags the calque in a TL;DR bullet", () => {
    expect(
      tldrBulletIssues(
        "Mistral released Timestral, a 5M–209M-parameter time-series foundation model family.",
        "Mistral ra mắt Timestral, gia đình foundation model chuỗi thời gian có 5M–209M tham số.",
        []
      )
    ).toEqual([
      `"model family" must not be rendered as "gia đình foundation model"; use "model family"`,
    ]);
  });
});

describe("translationDraftIssues inference engine", () => {
  const SOURCE = {
    title: "Mercury 3: Diffusion at scale",
    summary:
      "Mercury 3 is a diffusion LLM served by a new inference engine that runs 4 to 8 times faster than autoregressive models.",
  };

  it("flags 'khung suy diễn' and asks for the English term", () => {
    const issues = translationDraftIssues(
      SOURCE,
      {
        title: "Mercury 3: Diffusion ở quy mô lớn",
        summary:
          "Mercury 3 là diffusion LLM chạy trên một khung suy diễn mới, nhanh hơn 4 đến 8 lần so với mô hình tự hồi quy.",
      },
      [],
      false
    );
    expect(issues).toContain("keep these terms in English: inference engine");
    expect(issues).toContain(
      `"inference engine" must not be rendered as "khung suy diễn"; use "inference engine"`
    );
  });

  it("flags the other Vietnamese renderings in a TL;DR bullet", () => {
    for (const bad of [
      "công cụ suy luận",
      "động cơ suy luận",
      "khung suy luận",
    ]) {
      expect(
        tldrBulletIssues(
          "Inception shipped a new inference engine.",
          `Inception ra mắt ${bad} mới.`,
          []
        )
      ).toEqual([
        `"inference engine" must not be rendered as "${bad}"; use "inference engine"`,
      ]);
    }
  });

  it("passes a rendering that keeps the English term", () => {
    expect(
      tldrBulletIssues(
        "Inception shipped a new inference engine.",
        "Inception ra mắt inference engine mới.",
        []
      )
    ).toEqual([]);
  });

  it("leaves 'suy luận' alone when the source has no inference engine", () => {
    expect(
      tldrBulletIssues(
        "The lab improved reasoning speed.",
        "Phòng thí nghiệm cải thiện tốc độ suy luận, nhờ công cụ suy luận mới.",
        []
      )
    ).toEqual([]);
  });
});

describe("translationDraftIssues robotics calques", () => {
  // The owner's screenshot: "nhân quả" is causal, "con người" is people,
  // and "chung chung" is vague (written three times).
  it("flags the screenshot lines", () => {
    const issues = translationDraftIssues(
      ASTRA_EN,
      astraVi(
        "GPT-6-Astra đã đạt được trí tuệ nhân quả?",
        "thao tác bàn, con người, nền tảng di động và tay xoay tay",
        "tính chung chung chung"
      ),
      [],
      false
    );
    expect(issues).toEqual([
      `"embodied" must not be rendered as "nhân quả"; use "trí tuệ hiện thân"`,
      `"humanoid" must not be rendered as "con người"; use "robot hình người"`,
      `"generality" must not be rendered as "chung chung"; use "tính tổng quát"`,
    ]);
  });

  it("passes the stored translation", () => {
    expect(
      translationDraftIssues(
        ASTRA_EN,
        astraVi(
          "GPT-6-Astra đã đạt được embodied intelligence chưa?",
          "thao tác trên bàn, robot hình người, nền tảng di động và bàn tay khéo léo",
          "tính tổng quát"
        ),
        [],
        false
      )
    ).toEqual([]);
  });

  it("allows 'con người' when the source also writes about humans", () => {
    expect(
      tldrBulletIssues(
        "Figure says its humanoids now work next to humans on the line.",
        "Figure cho biết robot hình người của hãng đã làm việc cạnh con người trên dây chuyền.",
        []
      )
    ).toEqual([]);
    expect(
      tldrBulletIssues(
        "Figure says its humanoids work next to people.",
        "Figure cho biết robot của hãng làm việc cạnh con người.",
        []
      )
    ).toEqual([]);
  });

  it("allows 'nhân quả' when the source is about causality", () => {
    expect(
      tldrBulletIssues(
        "An embodied agent learns causal models of its world.",
        "Một embodied agent học mô hình nhân quả về thế giới của nó.",
        []
      )
    ).toEqual([]);
  });
});

// Real lines from 400 stored rows of 2026-10-12..19 that four raters read.
describe("translationDraftIssues garbled words", () => {
  const item = (en: string, vi: string) =>
    translationDraftIssues(
      { title: "", summary: en },
      { title: "", summary: vi },
      [],
      false
    );

  it("flags a word no Vietnamese spelling allows", () => {
    // Prod e64024cc, 4756ce2b.
    expect(
      item(
        "Harvey plans to integrate the capability into its platform.",
        "Harvey dự định tích hợp khả năng này vào nền tảp của công ty."
      )
    ).toEqual(['"tảp" is not a Vietnamese word; fix the spelling']);
    expect(
      item(
        "but try putting that doubt aside.",
        "nhưng hãy thử đặặt nghi ngờ sang một bên."
      )
    ).toEqual(['"đặặt" is not a Vietnamese word; fix the spelling']);
  });

  it("flags a Chinese character inside a Vietnamese word", () => {
    // Prod a8f3f9ff.
    expect(
      item(
        "This expansion includes a strategic partnership with Mistral AI.",
        "Sự mở rộng này bao gồm một đối tác chiến略 với Mistral AI."
      )
    ).toEqual(['"chiến略" is not a Vietnamese word; fix the spelling']);
  });

  it("passes loanwords, acronyms, and names the source writes", () => {
    // Prod a583c383, rated 4/3: "nơron" is a standard spelling.
    expect(
      item(
        "Neural networks may be much easier to read than researchers assumed.",
        "Mạng nơron có thể dễ đọc hơn so với các nhà nghiên cứu từng nghĩ."
      )
    ).toEqual([]);
    expect(
      item(
        "Nvidia's chief met President Emmanuel Macron at the Élysée Palace. The board approved it.",
        "CEO Nvidia gặp Tổng thống Emmanuel Macron tại điện Élysée. HĐQT đã thông qua."
      )
    ).toEqual([]);
  });
});

describe("translationDraftIssues number format", () => {
  const item = (en: string, vi: string) =>
    translationDraftIssues(
      { title: "", summary: en },
      { title: "", summary: vi },
      [],
      false
    );

  it("flags a decimal point kept from the source in an amount", () => {
    // Prod f8248405.
    expect(
      item(
        "Google's Gemini 4 Argon recorded a 55.4% score, ahead of GPT-6-Astra at 53.6%.",
        "Gemini 4 Argon của Google đạt điểm 55.4%, dẫn trước GPT-6-Astra với 53.6%."
      )
    ).toEqual([
      '"55.4" uses a decimal point; write "55,4"',
      '"53.6" uses a decimal point; write "53,6"',
    ]);
  });

  it("passes a thousands point, a version, and a model size", () => {
    expect(
      item(
        "Mistral AI used 4,000 Grace Blackwell chips. Claude Opus 5.5 leads; the 2.4B model scores 90.4 points on LIBERO-Plus.",
        "Mistral AI đã dùng 4.000 chip Grace Blackwell. Claude Opus 5.5 dẫn đầu; mô hình 2.4B đạt 90.4 điểm trên LIBERO-Plus."
      )
    ).toEqual(['"90.4" uses a decimal point; write "90,4"']);
  });

  it("flags a dollar figure left unconverted", () => {
    // Prod 457c1a52, 521e2a33, f5ceb2a3.
    expect(
      translationDraftIssues(
        {
          title:
            "NYC Comptroller Demands Pause of Anthropic's $2T IPO Over AI Safety",
          summary: "",
        },
        {
          title:
            "Thành viên NYC yêu cầu tạm dừng IPO $2T của Anthropic vì an toàn AI",
          summary: "",
        },
        [],
        true
      )
    ).toEqual(['"$2T" must be "2 nghìn tỷ USD"']);
    expect(
      item(
        "Reach Security raised a $50M+ Series B. Democrats asked about Meta's $6.6 billion federal tax credit.",
        "Reach Security huy động hơn $50M trong vòng Series B. Các thượng nghị sĩ hỏi về khoản tín dụng thuế liên bang $6,6 tỷ của Meta."
      )
    ).toEqual([
      '"$50M" must be "50 triệu USD"',
      '"$6,6 tỷ" must be "6,6 tỷ USD"',
    ]);
  });

  it("passes another currency written with a dollar sign", () => {
    // Prod 0e939dd0: New Taiwan dollars.
    expect(
      item(
        "Micron will invest NT$1.4 trillion in the park.",
        "Micron sẽ đầu tư 1,4 nghìn tỷ Đài tệ (tương đương NT$1,4 nghìn tỷ) vào khu này."
      )
    ).toEqual([]);
  });
});

describe("translationDraftIssues English headline", () => {
  it("flags a headline sentence returned in English", () => {
    // Prod 0dd91801: the summary is Vietnamese, the title is not.
    expect(
      translationDraftIssues(
        {
          title: "Meta shakes up the frontiers, open and closed",
          summary: "US open weights are back!",
        },
        {
          title: "Meta shakes up the frontiers, open and closed",
          summary: "Các mô hình open-weight của Mỹ đã trở lại!",
        },
        [],
        false
      )
    ).toEqual([
      "the title is still the English headline; write it in Vietnamese and keep only names in English",
    ]);
  });

  it("passes a release or product name kept as the title", () => {
    // Prod f1cb07a7 and 83a753b4, rated 5/4 and 4/3.
    for (const title of ["DeepSeek V4.1 Flash 1017 (Max)", "vLLM v0.32.0"]) {
      expect(
        translationDraftIssues(
          { title, summary: "" },
          { title, summary: "" },
          [],
          true
        )
      ).toEqual([]);
    }
  });
});

describe("translationDraftIssues AI-term calques", () => {
  const bullet = (en: string, vi: string) => tldrBulletIssues(en, vi, []);

  it("flags the stored calques", () => {
    // Prod 5502bd27, 8c1bc843, 9732b276, 55849128, da92b803.
    expect(
      bullet(
        "It handles OCR and visual reasoning over images.",
        "Nó hỗ trợ OCR và lý luận hình ảnh trên ảnh."
      )
    ).toEqual([
      '"reasoning" must not be rendered as "lý luận"; use "suy luận"',
    ]);
    expect(
      bullet(
        "A Multimodal Decision Model That Scores 65",
        "Một decision model đa dạng nhận điểm 65"
      )
    ).toEqual([
      '"multimodal" must not be rendered as "đa dạng"; use "đa phương thức"',
    ]);
    expect(
      bullet(
        "How Itaú is building generative AI for its entire customer base",
        "Itaú xây dựng AI sinh tạo cho toàn bộ khách hàng"
      )
    ).toEqual([
      '"generative" must not be rendered as "sinh tạo"; use "tạo sinh"',
    ]);
    expect(
      bullet(
        "It fits this threshold on the agent's own trajectories.",
        "Nó đặt ngưỡng này trên các quỹ đường đi của agent."
      )
    ).toEqual([
      '"trajectories" must not be rendered as "quỹ đường"; use "quỹ đạo"',
    ]);
    expect(
      bullet(
        "The method requires no access to model weights.",
        "Phương pháp này không cần truy cập trọng lượng mô hình."
      )
    ).toEqual([
      '"weights" must not be rendered as "trọng lượng"; use "trọng số"',
    ]);
  });

  it("flags local, frontier, and pipeline calques", () => {
    // Prod 0902dfba, f8d97139, 4472cef5.
    expect(
      bullet(
        "PrismML Releases Bonsai 2 Local AI Models",
        "PrismML ra mắt Bonsai 2 mô hình AI địa phương"
      )
    ).toEqual(['"local" must not be rendered as "địa phương"; use "cục bộ"']);
    expect(
      bullet(
        "They explored forming a private group to vet frontier AI models.",
        "Họ tính lập một nhóm riêng để kiểm định các mô hình AI tiên phong."
      )
    ).toEqual([
      '"frontier" must not be rendered as "tiên phong"; use "frontier"',
    ]);
    expect(
      bullet(
        "Our automated pipeline constructs 3D objects.",
        "Đường ống tự động của chúng tôi xây dựng các vật thể 3D."
      )
    ).toEqual([
      '"pipeline" must not be rendered as "đường ống"; use "pipeline"',
    ]);
  });

  it("passes the same words where the source licenses them", () => {
    // Prod 895a3776: local roads are "đường địa phương".
    expect(
      bullet(
        "It will enable partially automated driving on local roads.",
        "Hệ thống cho phép lái bán tự động trên các con đường địa phương."
      )
    ).toEqual([]);
    expect(
      bullet(
        "A multimodal model trained on diverse data.",
        "Một mô hình đa phương thức huấn luyện trên dữ liệu đa dạng."
      )
    ).toEqual([]);
    expect(
      bullet(
        "The judge rejected the company's legal reasoning.",
        "Thẩm phán bác lập luận pháp lý của công ty."
      )
    ).toEqual([]);
    expect(
      bullet(
        "Students use generative AI, and the students create videos.",
        "Học sinh dùng AI tạo sinh, và học sinh tạo ra video."
      )
    ).toEqual([]);
  });
});
