import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bareLocalizedCacheLang,
  cachedLocaleResponse,
  cachedSsrResponse,
  EDGE_CACHE_HEADER,
  edgeCacheKey,
  hasAuthSignal,
  normalizedCacheUrl,
  sharedMaxAge,
} from "./edge-cache";
import { hasCanonicalLocaleQuery } from "./locale-url";

const PUBLIC = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const EXT =
  "https://aidr.today/?ref=extension&utm_source=extension&utm_medium=newtab&utm_campaign=aidr_ext&utm_content=link&lang=vi";

function get(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers: { accept: "text/html", ...headers } });
}

function page(headers: Record<string, string> = {}, status = 200): Response {
  return new Response("<html></html>", {
    status,
    headers: {
      "content-type": "text/html",
      "cache-control": PUBLIC,
      ...headers,
    },
  });
}

describe("normalizedCacheUrl", () => {
  it("drops tracking params and sorts the rest", () => {
    expect(normalizedCacheUrl(EXT).toString()).toBe(
      "https://aidr.today/?lang=vi"
    );
    expect(
      normalizedCacheUrl(
        "https://aidr.today/?q=b&fbclid=1&gclid=2&mc_eid=3&lang=vi&a=z"
      ).search
    ).toBe("?a=z&lang=vi&q=b");
  });

  it("keeps non-tracking params that merely look similar", () => {
    expect(
      normalizedCacheUrl("https://aidr.today/?reference=1&tag=ai").search
    ).toBe("?reference=1&tag=ai");
  });
});

describe("hasCanonicalLocaleQuery", () => {
  it("stays public with the extension tracking query", () => {
    expect(hasCanonicalLocaleQuery(new URL(EXT).search)).toBe(true);
  });
});

describe("edgeCacheKey", () => {
  it("gives tracking variants the same key as the clean URL", () => {
    const clean = edgeCacheKey(get("https://aidr.today/?lang=vi"));
    expect(clean).not.toBeNull();
    expect(edgeCacheKey(get(EXT))?.url).toBe(clean?.url);
    expect(edgeCacheKey(get("https://aidr.today/?lang=en"))?.url).not.toBe(
      clean?.url
    );
  });

  it("never keys bare / (locale from cookie/Accept-Language)", () => {
    expect(edgeCacheKey(get("https://aidr.today/"))).toBeNull();
    expect(edgeCacheKey(get("https://aidr.today/?utm_source=x"))).toBeNull();
  });

  it("bypasses non-GET, non-HTML, private paths and invalid locales", () => {
    expect(edgeCacheKey(new Request(EXT, { method: "POST" }))).toBeNull();
    expect(edgeCacheKey(get(EXT, { accept: "application/json" }))).toBeNull();
    expect(edgeCacheKey(get("https://aidr.today/sign-in?lang=vi"))).toBeNull();
    expect(
      edgeCacheKey(get("https://aidr.today/subscribe?lang=vi&unsubscribe=1"))
    ).toBeNull();
    expect(edgeCacheKey(get("https://aidr.today/?lang=fr"))).toBeNull();
    expect(edgeCacheKey(get("https://aidr.today/?lang=vi&lang=en"))).toBeNull();
  });

  it("bypasses requests carrying auth", () => {
    expect(edgeCacheKey(get(EXT, { cookie: "__session=abc" }))).toBeNull();
    expect(edgeCacheKey(get(EXT, { authorization: "Bearer t" }))).toBeNull();
    expect(
      edgeCacheKey(get(EXT, { cookie: "__client_uat=1700000000" }))
    ).toBeNull();
    expect(
      edgeCacheKey(get(EXT, { cookie: "__client_uat=0; theme=dark" }))
    ).not.toBeNull();
  });

  it("keys neutral pages by the resolved locale", () => {
    const en = edgeCacheKey(
      get("https://aidr.today/about", { "accept-language": "en" })
    );
    const vi = edgeCacheKey(
      get("https://aidr.today/about?utm_source=x", { "accept-language": "vi" })
    );
    expect(en).not.toBeNull();
    expect(vi).not.toBeNull();
    expect(vi?.url).not.toBe(en?.url);
  });
});

describe("hasAuthSignal", () => {
  it("ignores unrelated cookies", () => {
    expect(hasAuthSignal(get(EXT, { cookie: "theme=dark" }))).toBe(false);
  });
});

describe("sharedMaxAge", () => {
  it("reads s-maxage from a public 200", () => {
    expect(sharedMaxAge(page())).toBe(300);
  });

  it("refuses private, no-store, set-cookie, vary * and non-200", () => {
    expect(sharedMaxAge(page({ "cache-control": "private, no-store" }))).toBe(
      0
    );
    expect(
      sharedMaxAge(page({ "cache-control": "no-store, s-maxage=300" }))
    ).toBe(0);
    expect(sharedMaxAge(page({ "set-cookie": "a=b" }))).toBe(0);
    expect(sharedMaxAge(page({ vary: "*" }))).toBe(0);
    expect(sharedMaxAge(page({}, 404))).toBe(0);
    expect(sharedMaxAge(page({ "cache-control": "public, max-age=60" }))).toBe(
      0
    );
  });
});

describe("cachedSsrResponse", () => {
  const store = new Map<string, Response>();
  const fake = {
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      store.set(req.url, res);
    }),
  };

  afterEach(() => {
    store.clear();
    fake.match.mockClear();
    fake.put.mockClear();
    vi.unstubAllGlobals();
  });

  function setup() {
    vi.stubGlobal("caches", { default: fake });
    const pending: Promise<unknown>[] = [];
    return {
      ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
      pending,
    };
  }

  it("misses, stores without Vary, then hits for a differently-tracked URL", async () => {
    const { ctx, pending } = setup();
    const render = vi.fn(async () => page({ vary: "Cookie, Accept-Language" }));

    const first = await cachedSsrResponse(get(EXT), ctx, render);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    await Promise.all(pending);
    expect(fake.put).toHaveBeenCalledOnce();
    expect(store.values().next().value?.headers.get("vary")).toBeNull();

    const second = await cachedSsrResponse(
      get("https://aidr.today/?lang=vi&utm_source=newsletter&fbclid=9"),
      ctx,
      render
    );
    expect(second.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await second.text()).toBe("<html></html>");
    expect(render).toHaveBeenCalledOnce();
  });

  it("does not store private, set-cookie or non-200 responses", async () => {
    const { ctx } = setup();
    for (const res of [
      page({ "cache-control": "private, no-store" }),
      page({ "set-cookie": "a=b" }),
      page({}, 500),
    ]) {
      const out = await cachedSsrResponse(get(EXT), ctx, async () => res);
      expect(out.headers.get(EDGE_CACHE_HEADER)).toBeNull();
    }
    expect(fake.put).not.toHaveBeenCalled();
  });

  it("renders straight through for authed requests and bare /", async () => {
    const { ctx } = setup();
    const render = vi.fn(async () => page());
    await cachedSsrResponse(get(EXT, { cookie: "__session=x" }), ctx, render);
    await cachedSsrResponse(get("https://aidr.today/"), ctx, render);
    expect(fake.match).not.toHaveBeenCalled();
    expect(fake.put).not.toHaveBeenCalled();
  });
});

describe("cachedLocaleResponse", () => {
  const store = new Map<string, Response>();
  const fake = {
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      store.set(req.url, res);
    }),
  };
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });
  const SHARED = "public, max-age=300, s-maxage=600";
  const feed = (lang: string) =>
    new Response(`<rss lang="${lang}"/>`, {
      headers: {
        "cache-control": "private, no-store",
        vary: "Cookie, Accept-Language",
      },
    });

  it("keeps one copy per language and never leaks public headers to clients", async () => {
    vi.stubGlobal("caches", { default: fake });
    const ctx = { waitUntil: () => undefined };
    const url = "https://aidr.today/feed.xml?utm_source=x";
    const vi1 = await cachedLocaleResponse(
      new Request(url),
      ctx,
      "vi",
      SHARED,
      async () => feed("vi")
    );
    await Promise.resolve();
    expect(vi1.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    const en = await cachedLocaleResponse(
      new Request(url),
      ctx,
      "en",
      SHARED,
      async () => feed("en")
    );
    expect(en.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    const render = vi.fn(async () => feed("vi"));
    const hit = await cachedLocaleResponse(
      new Request("https://aidr.today/feed.xml"),
      ctx,
      "vi",
      SHARED,
      render
    );
    expect(render).not.toHaveBeenCalled();
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await hit.text()).toBe('<rss lang="vi"/>');
    // Downstream caches still see the per-reader policy.
    expect(hit.headers.get("cache-control")).toBe("private, no-store");
    expect(hit.headers.get("vary")).toBe("Cookie, Accept-Language");
    expect(hit.headers.get("x-aidr-client-cc")).toBeNull();
  });

  it("bypasses signed-in readers", async () => {
    vi.stubGlobal("caches", { default: fake });
    const render = vi.fn(async () => feed("vi"));
    await cachedLocaleResponse(
      new Request("https://aidr.today/feed.xml", {
        headers: { cookie: "__session=abc" },
      }),
      { waitUntil: () => undefined },
      "vi",
      SHARED,
      render
    );
    expect(fake.put).not.toHaveBeenCalled();
  });
});

describe("bareLocalizedCacheLang", () => {
  it("keys bare / by the reader's resolved language", () => {
    expect(bareLocalizedCacheLang(get("https://aidr.today/"))).toBe("vi");
    expect(
      bareLocalizedCacheLang(
        get("https://aidr.today/", { "accept-language": "en-US" })
      )
    ).toBe("en");
    expect(
      bareLocalizedCacheLang(get("https://aidr.today/?utm_source=x"))
    ).toBe("vi");
  });
  it("leaves canonical, signed-in, and non-HTML requests to other paths", () => {
    expect(
      bareLocalizedCacheLang(get("https://aidr.today/?lang=vi"))
    ).toBeNull();
    expect(
      bareLocalizedCacheLang(
        get("https://aidr.today/", { cookie: "__session=abc" })
      )
    ).toBeNull();
    expect(
      bareLocalizedCacheLang(
        new Request("https://aidr.today/", {
          headers: { accept: "application/json" },
        })
      )
    ).toBeNull();
  });
});
