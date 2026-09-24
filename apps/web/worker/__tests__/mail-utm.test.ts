import { describe, expect, it } from "vitest";
import { withMailUtm } from "../mail/utm.js";

describe("withMailUtm", () => {
  it("tags aidr.today digest links with an explicit locale", () => {
    const out = withMailUtm("https://aidr.today/deadbeef", "digest", "vi");
    expect(out).toBe(
      "https://aidr.today/deadbeef?lang=vi&utm_source=email&utm_medium=digest&utm_campaign=digest"
    );
    const u = new URL(out);
    expect(u.searchParams.get("utm_source")).toBe("email");
    expect(u.searchParams.get("utm_medium")).toBe("digest");
    expect(u.searchParams.get("utm_campaign")).toBe("digest");
    expect(u.pathname).toBe("/deadbeef");
  });

  it("uses lang=en for an explicitly English mail", () => {
    const out = withMailUtm("https://aidr.today/deadbeef", "digest", "en");
    expect(out).toContain("?lang=en&utm_source=email");
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
