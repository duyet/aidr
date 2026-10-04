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

  it("clips the same-language sentence at 90 and drops a Vietnamese summary on English", () => {
    const text = highlightBulletText(
      {
        title: "Short title",
        title_vi: null,
        summary: `${"word ".repeat(40)}tail. Next sentence.`,
        summary_vi: "Đây là tiếng Việt trong bản tóm tắt.",
      },
      "en"
    );
    expect(text.startsWith("Short title — ")).toBe(true);
    const extra = text.slice("Short title — ".length);
    expect(extra.endsWith("…")).toBe(true);
    expect(extra.slice(0, -1).length).toBeLessThanOrEqual(90);
    expect(text).not.toContain("tail");
    expect(text).not.toContain("Next sentence");
    expect(text).not.toContain("tiếng Việt");
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
