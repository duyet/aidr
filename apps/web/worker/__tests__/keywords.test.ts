import { describe, expect, it } from "vitest";
import { isAiRelatedTitle } from "../sources/keywords.js";

describe("AI title gate", () => {
  it("keeps a new model release, a new kind of model, and a new lab", () => {
    expect(isAiRelatedTitle("Acme ships open weights for its first model")).toBe(
      true
    );
    expect(isAiRelatedTitle("A new world model for robots")).toBe(true);
    expect(isAiRelatedTitle("Former researchers start an AI lab")).toBe(true);
    expect(isAiRelatedTitle("City council approves the park budget")).toBe(
      false
    );
  });
});
