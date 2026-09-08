import { describe, expect, it } from "vitest";
import { publisherHost } from "./publisher-host";

describe("publisherHost", () => {
  it("strips www and returns the hostname", () => {
    expect(publisherHost("https://www.theverge.com/ai/123")).toBe(
      "theverge.com"
    );
  });

  it("returns null for missing or invalid URLs", () => {
    expect(publisherHost(null)).toBeNull();
    expect(publisherHost("not a url")).toBeNull();
  });
});
