import { describe, expect, it } from "vitest";
import { garbledWords, isVietnameseSpelling } from "../vi-syllable";

describe("isVietnameseSpelling", () => {
  it("accepts real syllables, including qu, gi and stop finals", () => {
    for (const word of [
      "vượt",
      "tạp",
      "quốc",
      "quyết",
      "gìn",
      "giữa",
      "khuya",
      "nghiêng",
      "thuở",
      "Nguyễn",
    ]) {
      expect([word, isVietnameseSpelling(word)]).toEqual([word, true]);
    }
  });

  // Prod garbles from the 2026-10-19 ratings.
  it("rejects a missing final, two tones, and a hỏi on a stop final", () => {
    for (const word of ["vượ", "đặặt", "tảp", "dựers", "ngă", "mọười"]) {
      expect([word, isVietnameseSpelling(word)]).toEqual([word, false]);
    }
  });

  it("accepts a toneless loanword and a foreign letter, not a toned run-on", () => {
    expect(isVietnameseSpelling("nơron")).toBe(true);
    expect(isVietnameseSpelling("ximăng")).toBe(true);
    expect(isVietnameseSpelling("Zürich")).toBe(true);
    expect(isVietnameseSpelling("nơờn")).toBe(false);
    expect(isVietnameseSpelling("độngngững")).toBe(false);
  });
});

describe("garbledWords", () => {
  it("returns CJK and misspelled words, skipping ASCII and source words", () => {
    expect(
      garbledWords(
        "kinh nghiệm t合成 giúp vượ qua MCP, giá 50.000đ, HĐQT duyệt, Đức và Señor",
        "Señor said MCP helps"
      )
    ).toEqual(["t合成", "vượ"]);
  });
});
