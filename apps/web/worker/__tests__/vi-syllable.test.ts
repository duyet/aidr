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
  // #927: well-formed syllables that no Vietnamese word uses, from stored rows.
  it("returns a well-formed syllable that is not in the lexicon", () => {
    expect(
      garbledWords(
        "các phòng nghiễn quốc gia, đang phát triên, The Information đư tin, chuyển đổi giọn nói",
        ""
      )
    ).toEqual(["nghiễn", "triên", "đư", "giọn"]);
  });

  it("accepts lexicon words and a capitalized name the lexicon lacks", () => {
    expect(
      garbledWords(
        "Nghiên cứu triển khai ở Hồng Kông và Quy Nhơn được tiếp tục",
        ""
      )
    ).toEqual([]);
  });

  it("returns CJK and misspelled words, skipping ASCII and source words", () => {
    expect(
      garbledWords(
        "kinh nghiệm t合成 giúp vượ qua MCP, giá 50.000đ, HĐQT duyệt, Đức và Señor",
        "Señor said MCP helps"
      )
    ).toEqual(["t合成", "vượ"]);
  });
});
