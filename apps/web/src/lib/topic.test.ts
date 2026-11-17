import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOPIC_CLASS, topicLabel, topicStyle } from "./topic";

describe("topicLabel", () => {
  it("names each category in Vietnamese in VI mode", () => {
    expect(
      [
        "Regulation",
        "Products",
        "Models",
        "Industry",
        "Research",
        "Chips",
        "Funding",
        "Agents",
        "Data",
        "Infra",
        "Open Source",
      ].map((name) => topicLabel(name, "vi"))
    ).toEqual([
      "Chính sách",
      "Sản phẩm",
      "Model",
      "Ngành",
      "Nghiên cứu",
      "Chip",
      "Gọi vốn",
      "Tác nhân",
      "Dữ liệu",
      "Hạ tầng",
      "Mã nguồn mở",
    ]);
  });

  it("matches the key case-insensitively and keeps English as given", () => {
    expect(topicLabel(" research ", "vi")).toBe("Nghiên cứu");
    expect(topicLabel("Research", "en")).toBe("Research");
  });

  it("passes an unknown category through instead of guessing", () => {
    expect(topicLabel("uncategorized", "vi")).toBe("uncategorized");
  });
});

describe("topicStyle", () => {
  it("carries the category's existing color pair", () => {
    expect(topicStyle("Research")).toEqual({
      "--tc-light": "#6d28d9",
      "--tc-dark": "#a78bfa",
    });
  });

  it("falls back to the neutral pair for an unknown category", () => {
    expect(topicStyle("brand-new-topic")).toEqual({
      "--tc-light": "#474747",
      "--tc-dark": "#a3a3a3",
    });
  });

  it("names classes that styles.css defines", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    for (const name of Object.values(TOPIC_CLASS)) {
      expect(css, name).toMatch(new RegExp(`\\.${name} \\{`));
    }
  });
});
