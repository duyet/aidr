import { describe, expect, it } from "vitest";
import { ogObjectKey } from "../../src/lib/og-cache.js";
import { dayCardVersion, highlightBulletText } from "../notify/day-card.js";

describe("highlightBulletText", () => {
  const item = {
    title: "Pop!_OS bans AI-generated code from much of its codebase",
    title_vi: "Pop!_OS cấm mã AI trong phần lớn phần mềm",
    summary:
      "System76 will not ship generated code in the desktop. A second sentence stays off the line.",
    summary_vi:
      "Pop!_OS đã cấm mã do AI viết trong phần lớn hệ điều hành. Câu sau không được đưa vào.",
  };

  it("adds the first sentence of the Vietnamese summary and stops there", () => {
    const text = highlightBulletText(item, "vi");
    expect(
      text.startsWith("Pop!_OS cấm mã AI trong phần lớn phần mềm — ")
    ).toBe(true);
    expect(text).toContain("đã cấm mã do AI viết");
    expect(text).not.toContain("Câu sau");
  });

  it("uses the English summary and leaves the Vietnamese one out", () => {
    const text = highlightBulletText(item, "en");
    expect(text).toContain("System76 will not ship generated code");
    expect(text).not.toContain("đã cấm");
    expect(text).not.toContain("second sentence");
  });

  it("keeps a headline when that language has no real summary", () => {
    expect(
      highlightBulletText(
        { ...item, summary: "No summary is available.", summary_vi: null },
        "en"
      )
    ).toBe(item.title);
    expect(
      highlightBulletText(
        {
          ...item,
          summary_vi: "System76 will not ship generated code in the desktop.",
        },
        "vi"
      )
    ).toBe(item.title_vi);
  });

  it("leaves out a first sentence that is too long to keep whole, and drops a Vietnamese summary on English", () => {
    const text = highlightBulletText(
      {
        title: "Short title",
        title_vi: null,
        summary: `${"word ".repeat(90)}tail. Next sentence.`,
        summary_vi: "Đây là tiếng Việt trong bản tóm tắt.",
      },
      "en"
    );
    // The sentence is longer than the clause cap: the headline stands alone,
    // with no half sentence and no ellipsis.
    expect(text).toBe("Short title");
    expect(text).not.toContain("word");
    expect(text).not.toContain("…");
    expect(text).not.toContain("tail");
    expect(text).not.toContain("Next sentence");
    expect(text).not.toContain("tiếng Việt");
  });

  it("keeps a typical long lead sentence, so digest lines carry a summary", () => {
    // 2026-10-14's dropped VI leads ran 173–206 chars; a lead that long must
    // still reach the 4096-char digest instead of leaving a bare headline.
    const lead = `IMF ${"cảnh báo rằng chi tiêu cho AI ".repeat(6)}đang tăng nhanh.`;
    expect(lead.length).toBeGreaterThan(180);
    const text = highlightBulletText(
      {
        title: "IMF cảnh báo về AI",
        title_vi: "IMF cảnh báo về AI",
        summary: null,
        summary_vi: `${lead} Câu sau.`,
      },
      "vi"
    );
    expect(text).toBe(`IMF cảnh báo về AI — ${lead}`);
  });

  it("leaves an English highlight as the title when its summary is Vietnamese", () => {
    expect(
      highlightBulletText(
        {
          title: "Pop!_OS bans AI-generated code",
          title_vi: "Pop!_OS cấm mã AI",
          summary: "System76 đã cấm mã do AI viết trong desktop.",
          summary_vi: null,
        },
        "en"
      )
    ).toBe("Pop!_OS bans AI-generated code");
  });

  it("drops a summary that repeats a headline ending in its source", () => {
    // 2026-10-14 EN digest, bullet 1: the summary is the headline without
    // "(@openainewsroom)", so a prefix check missed it and the line said the
    // same news twice.
    const title =
      "OpenAI says the FBI arrested one of its staffers after the company found a hidden recording device in its offices and used its models to identify who placed it (@openainewsroom)";
    expect(
      highlightBulletText(
        {
          title,
          title_vi: null,
          summary:
            "OpenAI says the FBI arrested one of its staffers after the company found a hidden recording device in its offices and used its models to identify who placed it.",
          summary_vi: null,
        },
        "en"
      )
    ).toBe(title);
  });

  it("keeps the next sentence when the first only repeats the headline", () => {
    expect(
      highlightBulletText(
        {
          title: "Pop!_OS bans AI-generated code",
          title_vi: null,
          summary:
            "Pop!_OS bans AI-generated code. System76 says the rule covers the desktop and its installer.",
          summary_vi: null,
        },
        "en"
      )
    ).toBe(
      "Pop!_OS bans AI-generated code — System76 says the rule covers the desktop and its installer."
    );
  });

  it("does not end the sentence at an initialism", () => {
    expect(
      highlightBulletText(
        {
          title: "Export rule",
          title_vi: null,
          summary:
            "U.S. officials approved the export rule today. A later sentence stays off.",
          summary_vi: null,
        },
        "en"
      )
    ).toBe("Export rule — U.S. officials approved the export rule today.");
  });
});

describe("dayCardVersion", () => {
  it("pads a short stamp so the digest URL is its own R2 key", () => {
    // Unpadded, s3i9q hashes to 4ws, which ogObjectKey drops.
    const stamp = dayCardVersion(["s3i9q"]);
    const key = ogObjectKey(
      new URL(
        `https://aidr.today/api/og/date/2026-10-04.png?lang=en&v=${stamp}`
      )
    );
    expect(key.endsWith(`/${stamp}`) && stamp === "04ws").toBe(true);
  });
});
