import { describe, expect, it } from "vitest";
import { truncateUtf16 } from "./truncate";

describe("truncateUtf16", () => {
  it("returns short text unchanged", () => {
    expect(truncateUtf16("abc", 5)).toBe("abc");
  });

  it("never splits a surrogate pair at the cut", () => {
    const out = truncateUtf16(`${"a".repeat(999)}😀`, 1000);
    expect(out).toBe("a".repeat(999));
    expect(out.isWellFormed()).toBe(true);
  });

  it("keeps a pair that fits entirely", () => {
    const out = truncateUtf16(`${"a".repeat(998)}😀b`, 1000);
    expect(out).toBe(`${"a".repeat(998)}😀`);
  });
});
