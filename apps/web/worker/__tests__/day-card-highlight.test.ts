import { describe, expect, it } from "vitest";
import { highlightBulletText } from "../notify/day-card.js";

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
});
