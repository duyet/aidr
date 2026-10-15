import { describe, expect, it } from "vitest";
import {
  IMPORTANCE_ANCHORS,
  IMPORTANCE_BANDS,
  IMPORTANCE_RUBRIC,
} from "../importance-rubric.js";
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
    for (const anchor of IMPORTANCE_ANCHORS) {
      expect(jev).toContain(anchor);
      expect(chat).toContain(anchor);
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

function band(range: (typeof IMPORTANCE_BANDS)[number]["range"]): string {
  return IMPORTANCE_BANDS.find((b) => b.range === range)?.meaning ?? "";
}

describe("importance band content", () => {
  // A lab list put any repo a listed lab pushed (Timestral-28M from
  // mistralai) one word from 9-10, where it bypasses the trending cap.
  it("names no lab, so publisher alone never lifts a story", () => {
    for (const lab of [
      "OpenAI",
      "Anthropic",
      "Google",
      "Meta",
      "xAI",
      "DeepSeek",
      "Qwen",
      "Mistral",
      "Moonshot",
    ]) {
      expect(IMPORTANCE_RUBRIC).not.toContain(lab);
    }
  });

  it("keeps variants and point updates out of 9-10", () => {
    expect(band("9-10")).toMatch(/not a point update, cheaper tier or variant/);
    expect(band("4-6")).toMatch(/variant of an existing model/);
    expect(band("4-6")).toMatch(/Lite/);
    expect(band("4-6")).toMatch(/speed or pricing mode/);
    expect(band("4-6")).toMatch(
      /whoever ships it and whatever its version number/
    );
  });

  // An unscoped "claims state of the art" clause put Mistral's own
  // "State-of-the-art probabilistic forecasting (5M-209M params)" at 7.6 and
  // a 4B grounding paper at 7.3; 173 of 1,560 items in a week say SOTA,
  // outperform or benchmark.
  it("lets only a frontier-scale model's state-of-the-art claim reach 7-8", () => {
    expect(band("7-8")).toMatch(
      /a frontier-scale model that claims overall state of the art on a recognised benchmark/
    );
    expect(band("7-8")).toMatch(
      /a small model's or a paper's state-of-the-art claim stays 4-6, whether it is for its size, for one language or a niche task, or made only by its publisher/
    );
  });

  // "Whose AI angle is incidental" let the Surface Laptop Ultra argue its
  // sell-out was about on-device AI demand and climb to 7.3.
  it("keeps every consumer gadget at 4-6 whatever its AI angle", () => {
    const gadgets = band("4-6")
      .split(". ")
      .find((sentence) => sentence.includes("Consumer gadgets"));
    expect(gadgets).toBe(
      "Consumer gadgets and their sales, preorders or stock, including AI PCs and AI devices, are 4-6"
    );
  });

  // "Any new model from any other lab" put every release at 7, the public
  // trending threshold, while production already bunched at 6-7. A
  // publisher-keyed 7-8 clause would let a big lab's Lite cut or 28M
  // checkpoint read as 7 as well.
  it("puts no publisher-keyed floor under model releases at 7-8", () => {
    expect(band("7-8")).not.toMatch(/\bany\b|leading lab/i);
    for (const anchor of IMPORTANCE_ANCHORS) {
      expect(anchor).not.toMatch(/\bany (new )?(model|release)\b/i);
    }
    expect(band("4-6")).toMatch(
      /variant of an existing model, which stays here whoever ships it/
    );
  });

  it("scores a provider's own price cut at 6-7, a same-price listing at 4-6 and a reseller promo low", () => {
    const deals = IMPORTANCE_ANCHORS.find((a) => a.startsWith("Deals:"));
    expect(deals).toMatch(/announced by the provider itself, is 6-7/);
    expect(deals).toMatch(/reseller's promo.*is 1-3/);
    expect(deals).toMatch(
      /reseller listing another company's model at that company's price is not a deal and is 4-6, even on launch day/
    );
  });

  // The unqualified gadget sentence put a leading lab's first device at 4-6,
  // under the trending floor; production scored OpenAI's first hardware push 9.
  it("lifts only a leading lab's first consumer device above the gadget band", () => {
    const devices = IMPORTANCE_ANCHORS.find((a) => a.startsWith("Devices:"));
    expect(devices).toBe(
      "Devices: a leading AI lab's first consumer device is 7-8 at launch. Other gadgets, and any gadget's sales, preorders or stock, stay 4-6."
    );
  });

  it("keeps a new model family out of 9-10 unless it is frontier", () => {
    expect(band("9-10")).toMatch(/a major new frontier model family/);
  });

  it("separates notable controversy from gossip", () => {
    const drama = IMPORTANCE_ANCHORS.find((a) => a.startsWith("Drama:"));
    expect(drama).toMatch(/notable controversy is 7-8/);
    expect(drama).toMatch(/Gossip is 1-3/);
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
