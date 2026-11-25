import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDGE_CACHE_STALE_S } from "./edge-cache-window";
import { globalHtmlCache, isGloballyCachedKey } from "./global-html-cache";

const HOME = "https://aidr.today/?lang=en&__v=2";

function fakeR2() {
  const objects = new Map<
    string,
    { body: string; customMetadata: Record<string, string> }
  >();
  const r2 = {
    get: vi.fn(async (key: string) => {
      const o = objects.get(key);
      return o
        ? { customMetadata: o.customMetadata, text: async () => o.body }
        : null;
    }),
    put: vi.fn(
      async (
        key: string,
        body: string,
        options: { customMetadata: Record<string, string> }
      ) => {
        objects.set(key, { body, customMetadata: options.customMetadata });
      }
    ),
  };
  return { r2, objects, binding: r2 as unknown as R2Bucket };
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  // Defect: the tier switching on in tests, dev, or a deploy without the
  // version binding, where a copy could not name the build.
  it("is off without the R2 binding or the version id", () => {
    const { binding } = fakeR2();
    expect(globalHtmlCache({})).toBeNull();
    expect(globalHtmlCache({ OG_CACHE: binding })).toBeNull();
    expect(
      globalHtmlCache({ CF_VERSION_METADATA: { id: "build-a" } })
    ).toBeNull();
  });

  // Defect: a copy rendered by another build served after a deploy, naming
  // /assets/* chunks this build does not carry.
  it("never returns a copy written by another build", async () => {
    const { binding } = fakeR2();
    const a = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    const b = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-b" },
    });
    await a?.put(new Request(HOME), entry(), 300);
    expect(await b?.get(new Request(HOME))).toBeNull();
    expect(await (await a?.get(new Request(HOME)))?.text()).toBe(
      "<html>a</html>"
    );
  });

  // Defect: objects accumulating per deploy, or leaving the html/ prefix
  // the bucket's other users (og-story/, og-day/) stay clear of.
  it("keeps one object per key under html/, overwritten by the next build", async () => {
    const { binding, objects } = fakeR2();
    const a = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    const b = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-b" },
    });
    await a?.put(new Request(HOME), entry("<html>a</html>"), 300);
    await b?.put(new Request(HOME), entry("<html>b</html>"), 300);
    expect([...objects.keys()]).toEqual([`html/${encodeURIComponent(HOME)}`]);
    expect(await (await b?.get(new Request(HOME)))?.text()).toBe(
      "<html>b</html>"
    );
  });

  // Defect: a dormant copy served past the Worker's stale window.
  it("stamps version and expiry, and reads a copy past its expiry as absent", async () => {
    const { binding, objects } = fakeR2();
    const cache = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    await cache?.put(new Request(HOME), entry(), 300);
    const [object] = [...objects.values()];
    expect(object?.customMetadata).toEqual({
      version: "build-a",
      expiresAt: String(
        Math.floor(Date.now() / 1000) + 300 + EDGE_CACHE_STALE_S
      ),
    });
    vi.advanceTimersByTime((300 + EDGE_CACHE_STALE_S - 1) * 1000);
    expect(await cache?.get(new Request(HOME))).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(await cache?.get(new Request(HOME))).toBeNull();
  });

  // Defect: a round trip that drops a header the Worker cache reads
  // (stored-at, fresh, client Cache-Control) or the content type.
  it("round-trips the stored entry's headers and body", async () => {
    const { binding } = fakeR2();
    const cache = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    const body = "<html>line one\nline two</html>";
    await cache?.put(new Request(HOME), entry(body), 300);
    const copy = await cache?.get(new Request(HOME));
    expect(Object.fromEntries(copy?.headers ?? [])).toEqual(
      Object.fromEntries(entry().headers)
    );
    expect(await copy?.text()).toBe(body);
  });

  // Defect: an R2 outage or a corrupt object failing the page instead of
  // falling through to a render.
  it("reads a failure or a malformed object as absent and never throws on put", async () => {
    const { binding, r2, objects } = fakeR2();
    const cache = globalHtmlCache({
      OG_CACHE: binding,
      CF_VERSION_METADATA: { id: "build-a" },
    });
    const k = `html/${encodeURIComponent(HOME)}`;
    const meta = {
      version: "build-a",
      expiresAt: String(Math.floor(Date.now() / 1000) + 100),
    };
    objects.set(k, { body: "no header line", customMetadata: meta });
    expect(await cache?.get(new Request(HOME))).toBeNull();
    objects.set(k, {
      body: "{not json\n<html></html>",
      customMetadata: meta,
    });
    expect(await cache?.get(new Request(HOME))).toBeNull();
    r2.get.mockRejectedValueOnce(new Error("R2 unavailable"));
    expect(await cache?.get(new Request(HOME))).toBeNull();
    r2.put.mockRejectedValueOnce(new Error("R2 write failed"));
    await expect(
      cache?.put(new Request(HOME), entry(), 300)
    ).resolves.toBeUndefined();
  });
});

describe("isGloballyCachedKey", () => {
  // Defect: unbounded keys (story pages, `?q=` searches) each writing R2,
  // so no write interval could bound the objects or the writes.
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
