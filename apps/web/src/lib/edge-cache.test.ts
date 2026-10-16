import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bareLocalizedCacheLang,
  cachedLocaleResponse,
  cachedSsrResponse,
  EDGE_CACHE_FRESH_MAX_S,
  EDGE_CACHE_HEADER,
  EDGE_CACHE_STALE_S,
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

  // Defect: /date and /week re-rendering on every request (they are not
  // localized paths in locale-routing, so no cache ever held them).
  it("keys day and week archives like story pages, not their Markdown twins", () => {
    expect(
      edgeCacheKey(get("https://aidr.today/date/2026-10-12?lang=en"))?.url
    ).toContain("/date/2026-10-12?");
    expect(
      edgeCacheKey(get("https://aidr.today/week/2026-W41?lang=vi"))?.url
    ).toContain("/week/2026-W41?");
    expect(edgeCacheKey(get("https://aidr.today/date/2026-10-12"))).toBeNull();
    expect(
      edgeCacheKey(get("https://aidr.today/date/2026-10-12.md?lang=en"))
    ).toBeNull();
    expect(
      bareLocalizedCacheLang(
        get("https://aidr.today/date/2026-10-12", { cookie: "news_lang=vi" })
      )
    ).toBe("vi");
    expect(
      bareLocalizedCacheLang(get("https://aidr.today/week/2026-W41"))
    ).toBe("vi");
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

const store = new Map<string, Response>();
const fake = {
  match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
  put: vi.fn(async (req: Request, res: Response) => {
    store.set(req.url, res);
  }),
};

function setup() {
  vi.stubGlobal("caches", { default: fake });
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) },
    pending,
  };
}

function advance(seconds: number) {
  vi.setSystemTime(Date.now() + seconds * 1000);
}

/** A render whose completion the test controls. */
function gate(body: () => Promise<Response>) {
  let release = () => {};
  const released = new Promise<void>((r) => {
    release = r;
  });
  const render = vi.fn(() => released.then(body));
  return { render, release };
}

const T0 = new Date("2026-10-16T00:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  store.clear();
  fake.match.mockClear();
  fake.put.mockClear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("cachedSsrResponse", () => {
  it("misses, stores without Vary, then hits for a differently-tracked URL", async () => {
    const { ctx, pending } = setup();
    const render = vi.fn(async () => page({ vary: "Cookie, Accept-Language" }));

    const first = await cachedSsrResponse(get(EXT), ctx, render);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    await Promise.all(pending);
    expect(fake.put).toHaveBeenCalledOnce();
    const stored = store.values().next().value;
    expect(stored?.headers.get("vary")).toBeNull();
    expect(stored?.headers.get("cache-control")).toBe(
      `s-maxage=${300 + EDGE_CACHE_STALE_S}`
    );

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

describe("stale-while-revalidate", () => {
  const v1 = () =>
    new Response("<html>v1</html>", {
      headers: { "content-type": "text/html", "cache-control": PUBLIC },
    });
  const v2 = async () =>
    new Response("<html>v2</html>", {
      headers: { "content-type": "text/html", "cache-control": PUBLIC },
    });

  async function seed(ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    await cachedSsrResponse(get(EXT), ctx, async () => v1());
  }

  // Defect: a stale hit blocking on the render, or the revalidation never stored.
  it("serves the stale body at once and swaps in the background render", async () => {
    const { ctx, pending } = setup();
    await seed(ctx);
    advance(301);

    const { render, release } = gate(v2);
    const stale = await cachedSsrResponse(get(EXT), ctx, render);
    expect(stale.headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(stale.headers.get("server-timing")).toBe("aidr-cache;desc=STALE");
    expect(await stale.text()).toBe("<html>v1</html>");
    expect(render).toHaveBeenCalledOnce();
    expect(fake.put).toHaveBeenCalledOnce();

    release();
    await Promise.all(pending);
    expect(fake.put).toHaveBeenCalledTimes(2);
    const after = await cachedSsrResponse(get(EXT), ctx, render);
    expect(after.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await after.text()).toBe("<html>v2</html>");
    expect(render).toHaveBeenCalledOnce();
  });

  // Defect: every stale hit in an isolate re-rendering (thundering herd).
  it("renders once for concurrent stale hits on one key", async () => {
    const { ctx, pending } = setup();
    await seed(ctx);
    advance(301);
    const { render, release } = gate(v2);
    const a = await cachedSsrResponse(get(EXT), ctx, render);
    const b = await cachedSsrResponse(get(EXT), ctx, render);
    expect(a.headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(b.headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(render).toHaveBeenCalledOnce();
    release();
    await Promise.all(pending);
    advance(301);
    await cachedSsrResponse(get(EXT), ctx, render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  // Defect: revalidating inside the fresh window.
  it("never renders on a fresh hit", async () => {
    const { ctx } = setup();
    await seed(ctx);
    advance(300);
    const render = vi.fn(v2);
    const hit = await cachedSsrResponse(get(EXT), ctx, render);
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(render).not.toHaveBeenCalled();
  });

  // Defect: serving content of unbounded age from a dormant colo.
  it("re-renders inline past the stale window", async () => {
    const { ctx } = setup();
    await seed(ctx);
    advance(300 + EDGE_CACHE_STALE_S + 1);
    const render = vi.fn(v2);
    const out = await cachedSsrResponse(get(EXT), ctx, render);
    expect(out.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(await out.text()).toBe("<html>v2</html>");
    expect(render).toHaveBeenCalledOnce();
  });

  // Defect: a transient 500 wiping a good copy.
  it("keeps the old entry when the revalidation render is not storable", async () => {
    const { ctx, pending } = setup();
    await seed(ctx);
    advance(301);
    const render = vi.fn(async () => page({}, 500));
    await cachedSsrResponse(get(EXT), ctx, render);
    await Promise.all(pending);
    expect(fake.put).toHaveBeenCalledOnce();
    const again = await cachedSsrResponse(get(EXT), ctx, render);
    expect(again.headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(await again.text()).toBe("<html>v1</html>");
  });

  // Defect: no waitUntil means no background work; serve as a hit, no render.
  it("serves a stale entry as HIT without a waitUntil context", async () => {
    const { ctx } = setup();
    await seed(ctx);
    advance(301);
    const render = vi.fn(v2);
    const out = await cachedSsrResponse(get(EXT), undefined, render);
    expect(out.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(render).not.toHaveBeenCalled();
  });

  // Defect: the CDN caching a stale page for 6h, or seeing internal headers.
  it("hands the client the render's own headers on HIT, STALE and MISS", async () => {
    const { ctx, pending } = setup();
    const render = async () =>
      page({ vary: "Cookie, Accept-Language", "x-extra": "kept" });
    const ssr = [
      await cachedSsrResponse(get(EXT), ctx, render),
      await cachedSsrResponse(get(EXT), ctx, render),
    ];
    advance(301);
    ssr.push(await cachedSsrResponse(get(EXT), ctx, render));
    await Promise.all(pending);
    expect(ssr.map((r) => r.headers.get(EDGE_CACHE_HEADER))).toEqual([
      "MISS",
      "HIT",
      "STALE",
    ]);
    for (const r of ssr) {
      expect(r.headers.get("cache-control")).toBe(PUBLIC);
      expect(r.headers.get("vary")).toBe("Cookie, Accept-Language");
      expect(r.headers.get("x-extra")).toBe("kept");
      expect(
        [...r.headers.keys()].filter((h) => h.startsWith("x-aidr-"))
      ).toEqual([EDGE_CACHE_HEADER]);
    }

    const SHARED = "public, max-age=300, s-maxage=600";
    const feed = async () =>
      new Response("<rss/>", {
        headers: {
          "cache-control": "private, no-store",
          vary: "Cookie, Accept-Language",
        },
      });
    const url = "https://aidr.today/feed.xml";
    const locale = [
      await cachedLocaleResponse(new Request(url), ctx, "vi", SHARED, feed),
      await cachedLocaleResponse(new Request(url), ctx, "vi", SHARED, feed),
    ];
    advance(601);
    locale.push(
      await cachedLocaleResponse(new Request(url), ctx, "vi", SHARED, feed)
    );
    await Promise.all(pending);
    expect(locale.map((r) => r.headers.get(EDGE_CACHE_HEADER))).toEqual([
      "MISS",
      "HIT",
      "STALE",
    ]);
    for (const r of locale) {
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("vary")).toBe("Cookie, Accept-Language");
      expect(
        [...r.headers.keys()].filter((h) => h.startsWith("x-aidr-"))
      ).toEqual([EDGE_CACHE_HEADER]);
    }
    const storedFeed = [...store.entries()].find(([k]) =>
      k.includes("feed.xml")
    )?.[1];
    expect(storedFeed?.headers.get("cache-control")).toBe(
      `s-maxage=${600 + EDGE_CACHE_STALE_S}`
    );
  });
});

describe("cachedLocaleResponse", () => {
  const SHARED = "public, max-age=300, s-maxage=600";
  const feed = (lang: string) =>
    new Response(`<rss lang="${lang}"/>`, {
      headers: {
        "cache-control": "private, no-store",
        vary: "Cookie, Accept-Language",
      },
    });

  it("keeps one copy per language and never leaks public headers to clients", async () => {
    const { ctx, pending } = setup();
    const url = "https://aidr.today/feed.xml?utm_source=x";
    const vi1 = await cachedLocaleResponse(
      new Request(url),
      ctx,
      "vi",
      SHARED,
      async () => feed("vi")
    );
    await Promise.all(pending);
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
    const { ctx } = setup();
    const render = vi.fn(async () => feed("vi"));
    await cachedLocaleResponse(
      new Request("https://aidr.today/feed.xml", {
        headers: { cookie: "__session=abc" },
      }),
      ctx,
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
