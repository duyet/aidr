import { describe, expect, it } from "vitest";
import { IMPORTANCE_BANDS } from "../importance-rubric.js";
import { CATEGORIES, scoreBatchPrompt } from "../llm.js";
import {
  importanceFromJev,
  JEV_IMPORTANCE_LEVELS,
  jevScoreQuestions,
  type SystemOneAnswer,
} from "../systemone.js";

/** Jev answer with all probability mass spread over level indices. */
function answer(probabilities: Record<string, number>): {
  importance: SystemOneAnswer;
} {
  return { importance: { type: "score", probabilities } };
}

describe("importance rubric", () => {
  // Without shared anchors the two paths drifted apart: Jev clustered at
  // 1–2/4 and chat at 6–8, so rank depended on which path scored the item.
  it("sends every band anchor to both the Jev and the chat scoring prompt", () => {
    const jev = jevScoreQuestions(CATEGORIES).importance.instructions;
    const chat = scoreBatchPrompt([
      { i: 0, title: "t", summary: "s", source: "hn" },
    ]);
    for (const band of IMPORTANCE_BANDS) {
      expect(jev).toContain(`${band.range}: ${band.meaning}`);
      expect(chat).toContain(`${band.range}: ${band.meaning}`);
    }
    expect(chat).toContain("importance (1-10)");
  });

  it("covers 1–10 with no gaps or overlaps", () => {
    const covered = IMPORTANCE_BANDS.flatMap((band) => {
      const [lo, hi] = band.range.split("-").map(Number);
      return Array.from(
        { length: (hi as number) - (lo as number) + 1 },
        (_, k) => (lo as number) + k
      );
    }).sort((a, b) => a - b);
    expect(covered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("importanceFromJev", () => {
  const top = JEV_IMPORTANCE_LEVELS.length - 1;

  it("spans the full 1–10 range", () => {
    expect(importanceFromJev(answer({ "0": 1 }))).toBe(1);
    expect(importanceFromJev(answer({ [String(top)]: 1 }))).toBe(10);
  });

  it("preserves order as mass moves to higher levels", () => {
    const scores = Array.from({ length: top + 1 }, (_, k) =>
      importanceFromJev(answer({ [String(k)]: 0.7, "0": 0.3 }))
    );
    for (let k = 1; k < scores.length; k++) {
      expect(scores[k] as number).toBeGreaterThan(scores[k - 1] as number);
    }
  });

  // Argmax put a 45/55 split between "minor" and "notable" at the minor end;
  // the weighted level keeps a big-but-uncertain story in the middle.
  it("weighs the whole distribution instead of taking the top level", () => {
    const split = importanceFromJev(answer({ "1": 0.55, "7": 0.45 }));
    expect(split as number).toBeGreaterThan(4);
    expect(split as number).toBeLessThan(7);
  });

  it("falls back to Jev's numeric expected index, then the level label", () => {
    expect(
      importanceFromJev({ importance: { type: "score", score: 4.5 } })
    ).toBe(5.5);
    expect(
      importanceFromJev({ importance: { type: "score", score: "7" } })
    ).toBe(7);
  });

  it("returns null for an unusable answer so chat scores the item", () => {
    expect(importanceFromJev({})).toBeNull();
    expect(
      importanceFromJev({ importance: { type: "score", score: 42 } })
    ).toBeNull();
    expect(importanceFromJev(answer({ "99": 1 }))).toBeNull();
  });
});
