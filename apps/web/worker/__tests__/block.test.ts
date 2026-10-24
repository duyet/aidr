import { describe, expect, it } from "vitest";
import { blockedBy } from "../sources/block.js";

describe("blockedBy", () => {
  it("names a GitHub 403 with an empty quota as a rate limit, not a refusal", () => {
    const headers = new Headers({ "x-ratelimit-remaining": "0" });
    expect(blockedBy(403, headers)).toBe("rate limited");
  });

  it("keeps a plain 403 as an access refusal", () => {
    expect(blockedBy(403, new Headers())).toBe("access refused");
    expect(blockedBy(403, new Headers({ "x-ratelimit-remaining": "12" }))).toBe(
      "access refused"
    );
  });

  it("reads 429 as rate limited and 500 as an ordinary error", () => {
    expect(blockedBy(429, new Headers())).toBe("rate limited");
    expect(blockedBy(500, new Headers())).toBeNull();
  });
});
