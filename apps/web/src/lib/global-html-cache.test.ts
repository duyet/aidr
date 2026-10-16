import { describe, expect, it, vi } from "vitest";
import { EDGE_CACHE_STALE_S } from "./edge-cache-window";
import { globalHtmlCache, isGloballyCachedKey } from "./global-html-cache";

const HOME = "https://aidr.today/?lang=en&__v=2";

function fakeKv() {
  const values = new Map<string, string>();
  const ttls: number[] = [];
  const kv = {
    get: vi.fn(async (key: string, _type: "text") => values.get(key) ?? null),
    put: vi.fn(
      async (
        key: string,
        value: string,
        options: { expirationTtl: number }
      ) => {
        values.set(key, value);
        ttls.push(options.expirationTtl);
      }
    ),
  };
  return { kv, values, ttls, binding: kv as unknown as KVNamespace };
}

function entry(body = "<html>a</html>"): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-aidr-stored-at": "1792108800",
      "x-aidr-fresh": "300",
      "x-aidr-client-cc": "public, max-age=60, s-maxage=300",
      "cache-control": `s-maxage=${300 + EDGE_CACHE_STALE_S}`,
    },
  });
}

describe("globalHtmlCache", () => {
  // Defect: the tier switching on in tests, dev, or a deploy without the
  // version binding, where a key could not name the build.
  it("is off without the KV binding or the version id", () => {
    const { binding } = fakeKv();
    expect(globalHtmlCache({})).toBeNull();
    expect(globalHtmlCache({ HTML_CACHE: binding })).toBeNull();
    expect(
      globalHtmlCache({ CF_VERSION_METADATA: { id: "build-a" } })
    ).toBeNull();
  });

  // Defect: a copy rendered by another build served after a deploy, naming
  // /assets/* chunks this build does not carry.
  it("never returns a copy written by another build", async () => {
    const { binding } = fakeKv();
    const a = globalHtmlCache({
      HTML_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    const b = globalHtmlCache({
      HTML_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-b" },
    });
    await a?.put(new Request(HOME), entry(), 300);
    expect(await b?.get(new Request(HOME))).toBeNull();
    expect(await (await a?.get(new Request(HOME)))?.text()).toBe(
      "<html>a</html>"
    );
  });

  // Defect: a round trip that drops a header the Worker cache reads
  // (stored-at, fresh, client Cache-Control) or the content type.
  it("round-trips the stored entry's headers and body", async () => {
    const { binding, ttls } = fakeKv();
    const cache = globalHtmlCache({
      HTML_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    const body = "<html>line one\nline two</html>";
    await cache?.put(new Request(HOME), entry(body), 300);
    const copy = await cache?.get(new Request(HOME));
    expect(Object.fromEntries(copy?.headers ?? [])).toEqual(
      Object.fromEntries(entry().headers)
    );
    expect(await copy?.text()).toBe(body);
    expect(ttls).toEqual([300 + EDGE_CACHE_STALE_S]);
  });

  // Defect: a KV outage or a corrupt value failing the page instead of
  // falling through to a render.
  it("reads a failure or a malformed value as absent and never throws on put", async () => {
    const { binding, kv, values } = fakeKv();
    const cache = globalHtmlCache({
      HTML_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    values.set(`build-a:${HOME}`, "no header line");
    expect(await cache?.get(new Request(HOME))).toBeNull();
    values.set(`build-a:${HOME}`, "{not json\n<html></html>");
    expect(await cache?.get(new Request(HOME))).toBeNull();
    kv.get.mockRejectedValueOnce(new Error("KV unavailable"));
    expect(await cache?.get(new Request(HOME))).toBeNull();
    kv.put.mockRejectedValueOnce(new Error("429 too many writes"));
    await expect(
      cache?.put(new Request(HOME), entry(), 300)
    ).resolves.toBeUndefined();
  });
});

describe("isGloballyCachedKey", () => {
  // Defect: unbounded keys (story pages, `?q=` searches) each writing KV,
  // past the 1,000 writes a day the Free plan allows.
  it("admits only the unfiltered homepage in one language", () => {
    for (const url of [
      HOME,
      "https://aidr.today/?lang=vi&__v=2",
      "https://aidr.today/?__l=en&__v=2",
      "https://aidr.today/?__l=vi&__v=2",
    ]) {
      expect(isGloballyCachedKey(new Request(url))).toBe(true);
    }
    for (const url of [
      "https://aidr.today/74c9e10c?lang=en&__v=2",
      "https://aidr.today/feed.xml?__l=en&__v=2",
      "https://aidr.today/?lang=en&q=openai&__v=2",
      "https://aidr.today/?lang=en&tag=agents&__v=2",
    ]) {
      expect(isGloballyCachedKey(new Request(url))).toBe(false);
    }
  });
});
