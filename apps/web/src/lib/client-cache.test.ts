import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, getCachedJson } from "./client-cache";

/**
 * The sessionStorage SWR cache exists so a repeat visit paints instantly
 * while the network revalidates. The tests below pin the guardrails that
 * make that safe: stale/private/error data must never be served as fresh,
 * concurrent remounts must share one request, and a failed request must
 * never pin itself in the in-flight map (the next remount retries).
 */

function memStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    map,
  };
}

function seed(url: string, entry: unknown) {
  sessionStorage.setItem(`aidr:json:${url}`, JSON.stringify(entry));
}

function jsonResponse(
  data: unknown,
  init: { status?: number; cacheControl?: string } = {}
) {
  const headers = new Headers();
  if (init.cacheControl) headers.set("cache-control", init.cacheControl);
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCachedJson", () => {
  it("returns null without sessionStorage (SSR / first visit)", () => {
    // No stub: node env has no sessionStorage — the cache must degrade
    // to "miss" instead of throwing.
    expect(getCachedJson("/api/x/no-storage", 60_000)).toBeNull();
  });

  it("returns null when nothing is stored for the url", () => {
    vi.stubGlobal("sessionStorage", memStorage());
    expect(getCachedJson("/api/x/empty", 60_000)).toBeNull();
  });

  it("serves a body stored within the caller's staleness budget", () => {
    vi.stubGlobal("sessionStorage", memStorage());
    const data = { items: [1, 2, 3] };
    seed("/api/x/fresh", { t: Date.now(), data });
    expect(getCachedJson<typeof data>("/api/x/fresh", 60_000)).toEqual(data);
  });

  it("treats entries older than ttlMs as a miss so SWR revalidates", () => {
    vi.stubGlobal("sessionStorage", memStorage());
    seed("/api/x/stale", { t: Date.now() - 61_000, data: { old: true } });
    expect(getCachedJson("/api/x/stale", 60_000)).toBeNull();
  });

  it("survives corrupt JSON instead of breaking render", () => {
    const store = memStorage();
    vi.stubGlobal("sessionStorage", store);
    store.map.set("aidr:json:/api/x/corrupt", "{not json");
    expect(getCachedJson("/api/x/corrupt", 60_000)).toBeNull();
  });

  it("rejects entries whose timestamp is not a number", () => {
    vi.stubGlobal("sessionStorage", memStorage());
    seed("/api/x/bad-t", { t: "yesterday", data: 1 });
    expect(getCachedJson("/api/x/bad-t", 60_000)).toBeNull();
  });
});

describe("fetchJson", () => {
  it("shares one network request between concurrent callers", async () => {
    vi.stubGlobal("sessionStorage", memStorage());
    let release!: (res: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (release = r)));
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/x/dedup";
    const p1 = fetchJson<{ ok: boolean }>(url);
    const p2 = fetchJson<{ ok: boolean }>(url);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(jsonResponse({ ok: true }));
    expect(await p1).toEqual({ ok: true });
    expect(await p2).toEqual({ ok: true });
  });

  it("reuses the resolved response so remounts do not refetch", async () => {
    vi.stubGlobal("sessionStorage", memStorage());
    const fetchMock = vi.fn(async () =>
      jsonResponse({ ok: true }, { cacheControl: "public, max-age=30" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/x/remount";
    expect(await fetchJson(url)).toEqual({ ok: true });
    expect(await fetchJson(url)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("persists only public Cache-Control bodies for the next visit", async () => {
    const store = memStorage();
    vi.stubGlobal("sessionStorage", store);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("public"))
        return jsonResponse(
          { a: 1 },
          { cacheControl: "public, max-age=30, s-maxage=120" }
        );
      if (url.endsWith("private"))
        return jsonResponse({ b: 2 }, { cacheControl: "private, no-store" });
      return jsonResponse({ c: 3 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchJson("/api/x/public")).toEqual({ a: 1 });
    expect(await fetchJson("/api/x/private")).toEqual({ b: 2 });
    expect(await fetchJson("/api/x/no-cc")).toEqual({ c: 3 });

    // Only the public body is readable by the SWR fast path.
    expect(getCachedJson("/api/x/public", 60_000)).toEqual({ a: 1 });
    expect(getCachedJson("/api/x/private", 60_000)).toBeNull();
    expect(getCachedJson("/api/x/no-cc", 60_000)).toBeNull();
  });

  it("resolves null on non-2xx and lets the next caller retry", async () => {
    vi.stubGlobal("sessionStorage", memStorage());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, { status: 500 }))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }, { cacheControl: "public" })
      );
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/x/flaky-500";
    expect(await fetchJson(url)).toBeNull();
    // The failure was evicted from the in-flight map — a remount retries
    // instead of pinning the error for the whole session.
    expect(await fetchJson(url)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves null on network failure and never caches it", async () => {
    const store = memStorage();
    vi.stubGlobal("sessionStorage", store);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }, { cacheControl: "public" })
      );
    vi.stubGlobal("fetch", fetchMock);

    const url = "/api/x/offline";
    expect(await fetchJson(url)).toBeNull();
    expect(store.map.size).toBe(0);
    expect(await fetchJson(url)).toEqual({ ok: true });
  });

  it("still resolves when sessionStorage quota rejects the write", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }, { cacheControl: "public" }))
    );

    // A full sessionStorage (private mode) must not lose the response.
    expect(await fetchJson("/api/x/quota")).toEqual({ ok: true });
  });

  it("works without sessionStorage at all (SSR safety)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }, { cacheControl: "public" }))
    );
    expect(await fetchJson("/api/x/ssr")).toEqual({ ok: true });
  });
});
