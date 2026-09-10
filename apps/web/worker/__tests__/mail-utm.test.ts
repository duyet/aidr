import { describe, expect, it } from "vitest";
import { withMailUtm } from "../mail/utm.js";

describe("withMailUtm", () => {
  it("tags aidr.today digest links", () => {
    const out = withMailUtm("https://aidr.today/ai/deadbeef", "digest");
    const u = new URL(out);
    expect(u.searchParams.get("utm_source")).toBe("email");
    expect(u.searchParams.get("utm_medium")).toBe("digest");
    expect(u.searchParams.get("utm_campaign")).toBe("digest");
    expect(u.pathname).toBe("/ai/deadbeef");
  });

  it("tags welcome CTAs", () => {
    const out = withMailUtm("https://aidr.today/", "welcome");
    expect(out).toContain("utm_medium=welcome");
    expect(out).toContain("utm_campaign=welcome");
  });

  it("leaves publisher URLs alone", () => {
    const src = "https://blog.duyet.net/post";
    expect(withMailUtm(src, "notes")).toBe(src);
  });

  it("returns invalid URLs unchanged", () => {
    expect(withMailUtm("not a url", "digest")).toBe("not a url");
  });
});
