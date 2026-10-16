import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GOLD_TO_KIND,
  KIND_OPTIONS,
  KIND_VARIANTS,
  kindQuestions,
  rulePR,
  type SampleItem,
} from "../../scripts/kind-eval.js";
import {
  BUILDER_CATEGORIES,
  CATEGORY_DEFINITIONS,
  CATEGORY_RULE,
  CORE_CATEGORIES,
} from "../llm.js";
import { jevScoreQuestions } from "../systemone.js";

const sample = JSON.parse(
  readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../scripts/fixtures/kind-eval/sample.json"
    ),
    "utf8"
  )
) as { items: SampleItem[] };

describe("kind eval request", () => {
  const production = jevScoreQuestions(
    CORE_CATEGORIES,
    BUILDER_CATEGORIES,
    CATEGORY_DEFINITIONS,
    CATEGORY_RULE
  );

  it.each(Object.keys(KIND_VARIANTS))(
    "%s adds one kind question TypeSafe accepts to the production questions",
    (variant) => {
      const { kind, ...rest } = kindQuestions(variant);
      expect(rest).toEqual(production);
      expect(kind?.type).toBe("choice");
      expect(Object.keys(kind?.criteria ?? {})).toEqual([...KIND_OPTIONS]);
      expect(KIND_OPTIONS.length).toBeLessThanOrEqual(10);
    }
  );

  it("control sends the production questions unchanged", () => {
    expect(kindQuestions("control")).toEqual(production);
  });

  it("maps every gold kind in the frozen sample onto an option", () => {
    const unmapped = sample.items.filter((i) => !GOLD_TO_KIND[i.goldKind]);
    expect(unmapped.map((i) => i.goldKind)).toEqual([]);
  });
});

describe("kind eval metrics", () => {
  it("reweights precision by each stratum's sampling rate", () => {
    // Two true drama stories sampled at full rate, one false positive from a
    // stratum sampled at 1 in 4: raw precision flatters the label.
    const rows = [
      { gold: "drama" as const, weight: 1 },
      { gold: "drama" as const, weight: 1 },
      { gold: "business" as const, weight: 4 },
    ];
    const pr = rulePR(rows, "drama", () => true);
    expect(pr.precision).toBe(66.7);
    expect(pr.wPrecision).toBe(33.3);
  });
});
