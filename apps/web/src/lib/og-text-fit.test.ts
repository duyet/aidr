import { describe, expect, it } from "vitest";
import {
  fitText,
  headlineRows,
  NBSP,
  textWidthEm,
  wrapLines,
} from "./og-text-fit";

const BOX = { width: 500, height: 120, lineHeight: 1.2 };

describe("fitText", () => {
  it("keeps a short headline whole at the largest size", () => {
    const fit = fitText("OpenAI ships a model", {
      ...BOX,
      sizes: [40, 32, 24],
    });
    expect(fit).toEqual({
      text: "OpenAI ships a model",
      fontSize: 40,
      lines: 1,
    });
  });

  it("steps down a size before it cuts any word", () => {
    const text =
      "Character.ai's Bankruptcy Documents Show the Economics of AI Don't Work";
    const fit = fitText(text, { ...BOX, sizes: [40, 32, 24] });
    expect(fit.text).toBe(text);
    expect(fit.fontSize).toBeLessThan(40);
  });

  it("cuts an overlong headline after a whole word, never inside one", () => {
    const text =
      "Mỹ siết kiểm soát biên giới bằng AI, cáo buộc 40 quốc gia tiếp tay cho Trung Quốc né 60 tỷ USD tiền thuế nhập khẩu chip trong năm 2026";
    const fit = fitText(text, { ...BOX, sizes: [40, 32], maxLines: 2 });
    expect(fit.fontSize).toBe(32);
    expect(fit.text.endsWith("…")).toBe(true);
    const kept = fit.text.slice(0, -1).split(" ");
    const words = text.split(" ");
    expect(kept).toEqual(words.slice(0, kept.length));
    expect(kept.length).toBeLessThan(words.length);
    expect(wrapLines(fit.text.split(" "), BOX.width / 32).length).toBe(2);
  });

  it("drops trailing punctuation before the ellipsis", () => {
    const fit = fitText("Alpha beta, gamma delta epsilon zeta eta theta", {
      width: 200,
      height: 30,
      lineHeight: 1.2,
      sizes: [24],
    });
    expect(fit.text).not.toMatch(/[,;:]…$/);
  });
});

describe("textWidthEm", () => {
  it("measures precomposed and decomposed Vietnamese the same", () => {
    const composed = "Tiếng Việt";
    expect(textWidthEm(composed.normalize("NFD"))).toBeCloseTo(
      textWidthEm(composed)
    );
  });

  it("never underestimates the widest glyphs of each class at weight 700", () => {
    // Advances (em) read from be-vietnam-pro-700.ttf's hmtx table. An
    // estimate below the renderer's width wraps a line late, and the clamp
    // then cuts the last word.
    const measured: Array<[string, number]> = [
      ["m", 0.896],
      ["W", 1.057],
      ["d", 0.668],
      ["O", 0.828],
      ["0", 0.7],
      ["-", 0.607],
      ["i", 0.296],
      [" ", 0.23],
    ];
    for (const [glyph, em] of measured) {
      expect(textWidthEm(glyph)).toBeGreaterThanOrEqual(em);
    }
  });
});

describe("headlineRows", () => {
  // Satori draws an ordinary space after some words ("YouTube", "CoreWeave",
  // "Tencent") twice as wide. A no-break space between the words of a row
  // draws at the normal width, so each row is built whole here.
  const TITLES = [
    "YouTube Music launches new labels as AI-generated music floods streaming platforms",
    "Cổ phiếu CoreWeave giảm hơn 15% và lãi suất trái phiếu gần 15%",
    "Tencent AI agent lands in WeChat",
  ];

  it.each(TITLES)(
    "joins the words of each row without a plain space: %s",
    (title) => {
      for (const row of headlineRows(title, 14)) expect(row).not.toMatch(/ /);
    }
  );

  it.each(TITLES)("keeps every word, in order: %s", (title) => {
    const words = headlineRows(title, 14).flatMap((row) => row.split(NBSP));
    expect(words).toEqual(title.split(" "));
  });

  it("breaks rows where wrapLines does", () => {
    const title = TITLES[0];
    const rows = headlineRows(title, 14);
    expect(rows.map((row) => row.split(NBSP))).toEqual(
      wrapLines(title.split(" "), 14)
    );
    expect(rows.length).toBeGreaterThan(1);
  });
});

describe("a word wider than its box", () => {
  const WORDS = ["DeepSeek-v4-flash-vision-exp", "A".repeat(43)];
  // Box sizes the day card variants use: lead, grid block, list row, tile.
  const BOXES = [
    { width: 1100, height: 450, sizes: [56, 52, 48, 44, 40, 36, 32, 30] },
    { width: 500, height: 300, sizes: [36, 34, 32, 30, 28], maxLines: 3 },
    { width: 340, height: 190, sizes: [36, 34, 32, 30, 28], maxLines: 3 },
    { width: 320, height: 84, sizes: [26, 24, 22, 20], maxLines: 3 },
    { width: 220, height: 74, sizes: [22, 20, 19, 18], maxLines: 2 },
    { width: 700, height: 100, sizes: [68, 64, 58, 52], maxLines: 1 },
    { width: 400, height: 84, sizes: [44, 40, 36, 32, 30, 28, 26, 25, 24, 23] },
  ];
  const cases = BOXES.flatMap((box) => WORDS.map((word) => ({ box, word })));

  it.each(cases)(
    "fits every row and ends in an ellipsis: $word in $box.width",
    ({ box, word }) => {
      for (const text of [word, `Launch ${word} today`]) {
        const fit = fitText(text, { ...box, lineHeight: 1.2 });
        const rows = headlineRows(fit.text, box.width / fit.fontSize);
        const max = Math.max(
          1,
          Math.min(
            box.maxLines ?? Infinity,
            Math.floor(box.height / (fit.fontSize * 1.2))
          )
        );
        expect(rows.length).toBeLessThanOrEqual(max);
        for (const row of rows) {
          expect(textWidthEm(row)).toBeLessThanOrEqual(
            box.width / fit.fontSize
          );
        }
        if (fit.text !== text) expect(rows[rows.length - 1]).toMatch(/…$/);
      }
    }
  );

  it("cuts a lone overlong word at the smallest size, not mid-glyph", () => {
    const fit = fitText("A".repeat(43), {
      width: 320,
      height: 84,
      lineHeight: 1.2,
      sizes: [26, 24, 22, 20],
      maxLines: 1,
    });
    expect(fit.fontSize).toBe(20);
    expect(fit.text).toMatch(/^A+…$/);
    expect(fit.text.length).toBeLessThan(43);
  });
});
