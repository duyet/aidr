import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreRubric } from "../../scripts/review/rubric";
import { autoChecks, RUBRIC, type ViInput } from "../../scripts/review/vi";

const fixture = (name: string): ViInput =>
  JSON.parse(
    readFileSync(
      new URL(`../../scripts/review/fixtures/${name}.json`, import.meta.url),
      "utf8"
    )
  );

const autoRows = RUBRIC.filter((row) => row.auto).map((row) => row.id);

describe("review-vi rubric", () => {
  it("sums to 10 and scores through the shared helper", () => {
    expect(() =>
      scoreRubric("vi", RUBRIC, autoChecks(fixture("vi-good")))
    ).not.toThrow();
  });

  it("passes every automatic row on a clean edition", () => {
    const result = autoChecks(fixture("vi-good"));
    for (const row of autoRows) expect(result[row], row).toEqual([]);
    const report = scoreRubric("vi", RUBRIC, result);
    expect(report.lost).toBe(0);
    expect(report.earned + report.open).toBe(10);
  });

  const cases: [row: string, id: string][] = [
    ["vi_garble", "980d4d8b"],
    ["vi_numbers", "3706f14f"],
    ["vi_calque_gloss", "2eb3a52b"],
    ["vi_calque_gloss", "be38b11f"],
    ["vi_doubled_case", "7be15b8e"],
    ["vi_untranslated", "5ed7b446"],
    ["vi_length", "980d4d8b"],
    ["vi_title_present", "ffffffff"],
    ["vi_keep_terms", "be38b11f"],
  ];
  it.each(cases)("%s fails and names story %s", (row, id) => {
    const reasons = autoChecks(fixture("vi-bad"))[row] ?? [];
    expect(reasons.some((reason) => reason.includes(id))).toBe(true);
  });

  it("fails every automatic row on the bad edition so it cannot ship", () => {
    const report = scoreRubric("vi", RUBRIC, autoChecks(fixture("vi-bad")));
    expect(report.rows.filter((r) => r.auto && r.result === "PASS")).toEqual(
      []
    );
    expect(report.earned + report.open).toBeLessThan(8);
  });

  it("flags a VI bullet that repeats its English twin", () => {
    const reasons = autoChecks(fixture("vi-bad")).vi_title_present ?? [];
    expect(reasons.some((reason) => reason.startsWith("bullet "))).toBe(true);
  });

  it("checks TL;DR bullets with the same gates and names the cited item", () => {
    const input = fixture("vi-good");
    const [first, ...rest] = input.bullets;
    if (!first) throw new Error("fixture has no bullets");
    const bullets = [
      {
        ...first,
        text: `${first.text} Doanh thu nền tảp đạt 16,3 triệu USD.`,
      },
      ...rest,
    ];
    const result = autoChecks({ ...input, bullets });
    const cited = first.itemIds[0]?.slice(0, 8) ?? "";
    expect(result.vi_garble?.some((r) => r.includes(cited))).toBe(true);
  });

  it("does not fail a story only for lacking a VI summary when the source has none", () => {
    const input = fixture("vi-good");
    const [item] = input.items;
    if (!item) throw new Error("fixture has no items");
    const items = [{ ...item, enSummary: null, viSummary: null }];
    const result = autoChecks({ items, bullets: [], rules: input.rules });
    expect(result.vi_length).toEqual([]);
  });
});
