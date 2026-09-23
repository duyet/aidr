import { describe, expect, it } from "vitest";
import { formatTokens } from "./format";

describe("formatTokens", () => {
  it("shows sub-thousand counts verbatim", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(999)).toBe("999");
  });

  it("compacts thousands to one decimal", () => {
    expect(formatTokens(1_000)).toBe("1.0k");
    expect(formatTokens(1_234)).toBe("1.2k");
    expect(formatTokens(999_499)).toBe("999.5k");
  });

  it("compacts millions to one decimal", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(1_234_567)).toBe("1.2M");
  });

  it("keeps the k suffix just below a million", () => {
    // Boundary quirk: 999_999 is still < 1e6, so it renders as
    // "1000.0k" rather than flipping to "1.0M".
    expect(formatTokens(999_999)).toBe("1000.0k");
  });
});
