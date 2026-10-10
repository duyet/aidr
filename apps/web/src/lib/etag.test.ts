import { describe, expect, it } from "vitest";
import { withEtag } from "./etag";

/**
 * /api/feed and /api/public change once per edition, but the Chrome extension
 * polls them. A matching If-None-Match must cost a 304 with no body, and the
 * cache policy must survive so the client keeps reusing its copy.
 */
const policy = "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": policy, Vary: "Origin" },
  });
}

function get(headers: Record<string, string> = {}) {
  return new Request("https://aidr.today/api/feed?lang=en", { headers });
}

describe("withEtag", () => {
  it("tags a 200 and answers a matching If-None-Match with an empty 304", async () => {
    const first = await withEtag(get(), json({ items: [1] }));
    const etag = first.headers.get("ETag");
    expect(etag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(await first.json()).toEqual({ items: [1] });

    const again = await withEtag(
      get({ "If-None-Match": etag ?? "" }),
      json({ items: [1] })
    );
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(again.headers.get("ETag")).toBe(etag);
    expect(again.headers.get("Cache-Control")).toBe(policy);
    expect(again.headers.get("Vary")).toBe("Origin");
  });

  it("serves the new body once the edition changes", async () => {
    const old = await withEtag(get(), json({ items: [1] }));
    const next = await withEtag(
      get({ "If-None-Match": old.headers.get("ETag") ?? "" }),
      json({ items: [2] })
    );
    expect(next.status).toBe(200);
    expect(next.headers.get("ETag")).not.toBe(old.headers.get("ETag"));
    expect(await next.json()).toEqual({ items: [2] });
  });

  it("accepts strong-form and listed tags (weak comparison)", async () => {
    const etag = (await withEtag(get(), json({ a: 1 }))).headers.get("ETag");
    const strong = etag?.replace(/^W\//, "") ?? "";
    const res = await withEtag(
      get({ "If-None-Match": `"other", ${strong}` }),
      json({ a: 1 })
    );
    expect(res.status).toBe(304);
  });

  it("never tags errors, so a failure is not revalidated as current", async () => {
    const res = await withEtag(get(), json({ error: "x" }, 500));
    expect(res.status).toBe(500);
    expect(res.headers.get("ETag")).toBeNull();
  });
});
