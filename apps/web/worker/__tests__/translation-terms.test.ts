import { describe, expect, it } from "vitest";
import {
  extractProtectedTerms,
  KEEP_ENGLISH_PROSE,
  KEEP_ENGLISH_TERMS,
  keepVerbatimList,
  missingProtectedTerms,
  RULES_OVERVIEW,
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

  it("demands a kept technical term verbatim", () => {
    const source = {
      title: "The lab shipped an inference SDK",
      summary: "It fine-tunes LoRA adapters and serves RAG over MCP on GPU.",
    };
    const missing = missingProtectedTerms(source, {
      title: "Lab giao một bộ suy luận",
      summary: "Nó tinh chỉnh bộ thích ứng và phục vụ truy xuất trên bộ xử lý.",
    });
    expect(missing.jargon).toEqual(
      expect.arrayContaining([
        "inference",
        "SDK",
        "fine-tun",
        "LoRA",
        "RAG",
        "MCP",
        "GPU",
      ])
    );
    expect(keepVerbatimList(source)).toEqual(
      expect.arrayContaining([
        "inference",
        "SDK",
        "fine-tune",
        "LoRA",
        "RAG",
        "MCP",
        "GPU",
      ])
    );
  });

  it("keeps the guard and the prompt on the same new terms", () => {
    for (const term of ["RAG", "MCP", "SDK", "GPU", "inference", "LoRA"]) {
      expect(KEEP_ENGLISH_TERMS).toContain(term);
      expect(KEEP_ENGLISH_PROSE.toLowerCase()).toContain(term.toLowerCase());
    }
    // "finetune" and "fine-tune" are one stem. The guard demands it; the
    // prompt names both spellings. "open-source" is neither.
    expect(KEEP_ENGLISH_PROSE).toContain("finetune");
    expect(KEEP_ENGLISH_TERMS).toContain("fine-tun");
    expect(KEEP_ENGLISH_PROSE).not.toMatch(/open-source/);
    expect(KEEP_ENGLISH_TERMS.join(" ")).not.toMatch(/open-source/);
    expect(
      keepVerbatimList({ title: "We finetune LoRA", summary: "" })
    ).toEqual(expect.arrayContaining(["fine-tune", "LoRA"]));
  });

  it('renders open-source as "mã nguồn mở" instead of keeping the English', () => {
    const source = {
      title: "Meta open-sources a coding model",
      summary: "The open-source release is free.",
    };
    expect(extractProtectedTerms(source).jargon).toEqual([]);
    expect(keepVerbatimList(source).join(" ")).not.toMatch(/open-source/);
    expect(RULES_OVERVIEW).toContain('open-source is "mã nguồn mở"');
  });

  it("does not treat a longer name as a short acronym", () => {
    expect(
      extractProtectedTerms({
        title: "McPherson joins the lab",
        summary: "A fragile consensus, not a RAG paper.",
      }).jargon
    ).toEqual(["RAG"]);
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
