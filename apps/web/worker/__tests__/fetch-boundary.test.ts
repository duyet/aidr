import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithSafeRedirects,
  isFetchableUrl,
  redactUrlForLog,
} from "../enrich.js";

describe("enrichment fetch boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("redacts signed URL paths and query strings from diagnostics", () => {
    expect(
      redactUrlForLog(
        "https://cdn.example/private/hero.jpg?X-Amz-Signature=secret"
      )
    ).toBe("https://cdn.example/[path-redacted]");
  });

  it("rejects credentials, non-default ports, and reserved address forms", () => {
    for (const url of [
      "https://user:pass@example.com/article",
      "https://example.com:8443/article",
      "http://127.0.0.1/article",
      "http://2130706433/article",
      "http://0x7f000001/article",
      "http://[::1]/article",
      "http://[fc00::1]/article",
      "http://[::ffff:127.0.0.1]/article",
      "http://[::127.0.0.1]/article",
      "http://[::ffff:0:127.0.0.1]/article",
      "http://[64:ff9b::127.0.0.1]/article",
      "http://[2001:db8::1]/article",
    ]) {
      expect(isFetchableUrl(url), url).toBe(false);
    }
    expect(isFetchableUrl("https://example.com/article")).toBe(true);
    expect(isFetchableUrl("http://example.com:80/article")).toBe(false);
    expect(isFetchableUrl("https://example.com/article")).toBe(true);
  });

  it("validates every redirect hop before making the next request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        })
      )
      .mockResolvedValueOnce(new Response("should not be read"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithSafeRedirects("https://example.com/start")
    ).rejects.toThrow(/blocked fetch URL/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a bounded public redirect and checks the final response URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "/final" },
        })
      )
      .mockResolvedValueOnce(new Response("<html>ok</html>"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithSafeRedirects("https://example.com/start");
    expect(await response.text()).toContain("ok");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.com/start",
      expect.objectContaining({ redirect: "manual" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.com/final",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("rejects a final URL that violates the policy", async () => {
    const response = new Response("<html>ok</html>");
    Object.defineProperty(response, "url", {
      value: "http://127.0.0.1/final",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(
      fetchWithSafeRedirects("https://example.com/start")
    ).rejects.toThrow(/blocked final fetch URL/);
  });
});
