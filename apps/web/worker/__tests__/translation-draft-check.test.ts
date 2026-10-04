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
  // A year, a count, or a percentage in parentheses is not a gloss.
  it("flags a parenthetical English gloss and ignores a year", () => {
    const issues = translationDraftIssues(
      { title: "Story", summary: "Founded then." },
      {
        title: "Tác nhân (agent)",
        summary:
          "Hãng dùng RAG (Retrieval-Augmented Generation). Ra mắt bước (3) năm (2024), tăng (12%).",
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
