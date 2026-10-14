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
