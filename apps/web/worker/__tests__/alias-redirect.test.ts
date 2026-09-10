import { describe, expect, it } from "vitest";
import { aliasRedirect } from "../alias-redirect.js";

describe("aliasRedirect", () => {
  it("308s news.duyet.net path to aidr.today without dropping the path", () => {
    const res = aliasRedirect(new Request("https://news.duyet.net/subscribe"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(308);
    expect(res!.headers.get("Location")).toBe("https://aidr.today/subscribe");
  });

  it("preserves query string", () => {
    const res = aliasRedirect(
      new Request("https://news.duyet.net/api/public?x=1&lang=vi")
    );
    expect(res!.headers.get("Location")).toBe(
      "https://aidr.today/api/public?x=1&lang=vi"
    );
  });

  it("does not emit a double slash on the root", () => {
    const res = aliasRedirect(new Request("https://news.duyet.net/"));
    expect(res!.headers.get("Location")).toBe("https://aidr.today/");
    expect(res!.headers.get("Location")).not.toContain("today//");
  });

  it("redirects www.news.duyet.net the same way", () => {
    const res = aliasRedirect(new Request("https://www.news.duyet.net/about"));
    expect(res!.headers.get("Location")).toBe("https://aidr.today/about");
  });

  it("does not redirect aidr.today", () => {
    expect(
      aliasRedirect(new Request("https://aidr.today/subscribe"))
    ).toBeNull();
    expect(
      aliasRedirect(new Request("https://aidr.today/api/public?x=1"))
    ).toBeNull();
  });

  it("honors the Host header when it differs from the URL host", () => {
    const res = aliasRedirect(
      new Request("https://aidr.today/subscribe", {
        headers: { Host: "news.duyet.net" },
      })
    );
    expect(res!.headers.get("Location")).toBe("https://aidr.today/subscribe");
  });
});
