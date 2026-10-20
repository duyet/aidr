import { describe, expect, it } from "vitest";
import { scoreRubric } from "../../scripts/review/rubric";

const rubric = [
  { id: "a", points: 6, auto: true, ask: "a" },
  { id: "b", points: 4, ask: "b" },
];

describe("scoreRubric", () => {
  it("earns an automatic row only when it has no failure reasons", () => {
    expect(scoreRubric("s", rubric, { a: [] })).toMatchObject({
      earned: 6,
      lost: 0,
      open: 4,
    });
    expect(scoreRubric("s", rubric, { a: ["bad"] })).toMatchObject({
      earned: 0,
      lost: 6,
    });
  });

  it("refuses a rubric that does not sum to 10", () => {
    expect(() => scoreRubric("s", rubric.slice(0, 1), { a: [] })).toThrow(
      /sums to 6/
    );
  });

  it("refuses an automatic row the script did not decide", () => {
    expect(() => scoreRubric("s", rubric, {})).toThrow(/no automatic result/);
  });
});
