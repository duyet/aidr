/**
 * `/api/thumb/$id` resizes only a picture a published story carries. The
 * defects guarded here: an open proxy (any `u` fetched), a cached copy that
 * outlives the story's image, cache-busting query noise that forces a fresh
 * publisher fetch per request, a failing source fetched again on every
 * request, a followed publisher redirect, an SVG or oversized or stalled
 * source reaching the resizer, and a resize failure that hides the thumb
 * instead of sending the browser to the publisher.
 */
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  Route,
  THUMB_SIDE,
  THUMB_RENDER_VERSION,
  MAX_THUMB_SOURCE_BYTES,
  SOURCE_TIMEOUT_MS,
} = await import("./api/thumb.$id");

type Handler = (args: {
  request: Request;
  context: unknown;
  params: Record<string, string>;
}) => Promise<Response>;

const get: Handler = (
  Route as unknown as {
    options: { server: { handlers: { GET: Handler } } };
  }
).options.server.handlers.GET;

const ID = "abcdef12deadbeef".repeat(4);
const OWNED = "https://cdn.example.com/hero-1920x1080.jpeg";
const MANIFEST_IMAGE = "https://cdn.example.com/second.png";
const MANIFEST = JSON.stringify({
  version: 1,
  assets: [
    { type: "image", url: OWNED },
    { type: "image", url: MANIFEST_IMAGE },
  ],
});

let sqlite: DatabaseSync;
let fetched: string[] = [];
let transforms: Array<Record<string, unknown>> = [];
let outputs: Array<Record<string, unknown>> = [];
let transformFails = false;
let cached: Map<
  string,
  { status: number; body: ArrayBuffer; headers: Headers }
>;
let reads = 0;

function fakeImages(): ImagesBinding {
  return {
    input: () => ({
      transform: (options: Record<string, unknown>) => {
        transforms.push(options);
        return {
          output: async (format: Record<string, unknown>) => {
            if (transformFails) throw new Error("decode failed");
            outputs.push(format);
            return {
              response: () =>
                new Response("webp-bytes", {
                  headers: { "content-type": "image/webp" },
                }),
            };
          },
        };
      },
    }),
  } as unknown as ImagesBinding;
}

/** D1 over node:sqlite, so the route's own SQL (status filter included)
 *  runs against real rows. */
function sqliteD1(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => {
          args = a;
          return stmt;
        },
        first: async () => {
          reads += 1;
          return db.prepare(sql).get(...(args as never[])) ?? null;
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

function fakeCache(): Cache {
  return {
    match: async (req: Request) => {
      const entry = cached.get(req.url);
      return entry
        ? new Response(entry.body.slice(0), {
            status: entry.status,
            headers: entry.headers,
          })
        : undefined;
    },
    put: async (req: Request, res: Response) => {
      cached.set(req.url, {
        status: res.status,
        body: await res.arrayBuffer(),
        headers: res.headers,
      });
    },
  } as unknown as Cache;
}

function env(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { DB: sqliteD1(sqlite), IMAGES: fakeImages(), ...extra };
}

function callUrl(
  path: string,
  id: string,
  environment: Record<string, unknown> = env()
): Promise<Response> {
  return get({
    request: new Request(`https://aidr.today${path}`),
    context: { cloudflare: { env: environment } },
    params: { id },
  });
}

function call(
  u: string | null,
  environment: Record<string, unknown> = env()
): Promise<Response> {
  const query = u === null ? "" : `?u=${encodeURIComponent(u)}`;
  return callUrl(`/api/thumb/${ID}${query}`, ID, environment);
}

function publisherAnswers(response: () => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      return response();
    })
  );
}

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE items (id TEXT PRIMARY KEY, url TEXT,
    image_url TEXT, media_manifest TEXT, status TEXT)`);
  sqlite
    .prepare("INSERT INTO items VALUES (?, ?, ?, ?, 'published')")
    .run(ID, "https://publisher.example.com/story", OWNED, MANIFEST);
  fetched = [];
  transforms = [];
  outputs = [];
  transformFails = false;
  cached = new Map();
  reads = 0;
  vi.stubGlobal("caches", { default: fakeCache() });
  publisherAnswers(
    () =>
      new Response("jpeg-bytes", { headers: { "content-type": "image/jpeg" } })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("api/thumb/$id", () => {
  it("resizes the story's own image to a square WebP with long caching", async () => {
    const res = await call(OWNED);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(await res.text()).toBe("webp-bytes");
    expect(fetched).toEqual([OWNED]);
    expect(transforms).toEqual([
      { width: THUMB_SIDE, height: THUMB_SIDE, fit: "cover" },
    ]);
    expect(outputs[0]?.format).toBe("image/webp");
  });

  it("accepts a manifest image asset as well as image_url", async () => {
    const res = await call(MANIFEST_IMAGE);
    expect(res.status).toBe(200);
    expect(fetched).toEqual([MANIFEST_IMAGE]);
  });

  it("refuses a URL the story does not carry before fetching anything", async () => {
    const res = await call("https://cdn.example.com/not-ours.jpg");
    expect(res.status).toBe(404);
    expect(fetched).toEqual([]);
  });

  it("refuses a missing u, a private host, and a merged or unknown story without fetching", async () => {
    expect((await call(null)).status).toBe(404);
    expect((await call("http://10.0.0.1/hero.jpg")).status).toBe(404);
    sqlite.exec("UPDATE items SET status = 'merged'");
    expect((await call(OWNED)).status).toBe(404);
    sqlite.exec("DELETE FROM items");
    expect((await call(OWNED)).status).toBe(404);
    expect(fetched).toEqual([]);
  });

  it("serves one edge copy per item and image whatever the query noise, and refuses short ids and slugs", async () => {
    const u = encodeURIComponent(OWNED);
    const busters = [
      `/api/thumb/${ID}?u=${u}`,
      `/api/thumb/${ID}?u=${u}&r=1`,
      `/api/thumb/${ID}?r=2&u=${u}`,
      `/api/thumb/${ID}?u=${u}&utm_source=x&utm_medium=y`,
      `/api/thumb/${ID}?u=${u}#frag`,
      `/api/thumb/${ID}?u=${encodeURIComponent(`  ${OWNED}  `)}`,
    ];
    for (const path of busters) {
      const res = await callUrl(path, ID);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toBe("webp-bytes");
    }
    for (const id of [ID.slice(0, 8), `junk-${ID}`]) {
      const res = await callUrl(`/api/thumb/${id}?u=${u}`, id);
      expect(res.status, id).toBe(404);
    }
    expect(fetched).toEqual([OWNED]);
    expect(reads).toBe(busters.length);
    expect([...cached.keys()]).toEqual([
      `https://aidr.today/api/thumb/v${THUMB_RENDER_VERSION}/${ID}?u=${u}`,
    ]);
  });

  it("stops serving a cached thumb once the story drops the image", async () => {
    expect((await call(OWNED)).status).toBe(200);
    expect((await call(OWNED)).status).toBe(200);
    expect(fetched).toEqual([OWNED]);
    sqlite.exec("UPDATE items SET image_url = NULL, media_manifest = NULL");
    expect((await call(OWNED)).status).toBe(404);
    expect(fetched).toEqual([OWNED]);
  });

  it("sends the browser to the publisher URL when the resize fails", async () => {
    transformFails = true;
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("sends the browser to the publisher URL when the publisher answers 3xx, without following it", async () => {
    const redirects: Array<RequestRedirect | undefined> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        fetched.push(url);
        redirects.push(init?.redirect);
        // A followed redirect lands on the private host's image.
        return init?.redirect === "manual"
          ? new Response("<html>", {
              status: 302,
              headers: { location: "http://10.0.0.1/x" },
            })
          : new Response("private-bytes", {
              headers: { "content-type": "image/jpeg" },
            });
      })
    );
    const res = await call(OWNED);
    expect(redirects).toEqual(["manual"]);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(transforms).toEqual([]);
  });

  it("sends the browser to the publisher URL when the publisher answers non-image", async () => {
    publisherAnswers(
      () => new Response("<html>", { headers: { "content-type": "text/html" } })
    );
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(transforms).toEqual([]);
  });

  it("fetches a failing source once per edge copy and keeps the miss for 5 minutes", async () => {
    publisherAnswers(() => new Response("forbidden", { status: 403 }));
    for (let i = 0; i < 3; i++) {
      const res = await call(OWNED);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(OWNED);
    }
    expect(fetched).toEqual([OWNED]);
    const u = encodeURIComponent(OWNED);
    const entry = cached.get(
      `https://aidr.today/api/thumb/v${THUMB_RENDER_VERSION}/${ID}?u=${u}`
    );
    expect(entry?.status).toBe(302);
    expect(entry?.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("stops redirecting to a cached miss once the story drops the image", async () => {
    publisherAnswers(() => new Response("forbidden", { status: 403 }));
    expect((await call(OWNED)).status).toBe(302);
    sqlite.exec("UPDATE items SET image_url = NULL, media_manifest = NULL");
    const res = await call(OWNED);
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(fetched).toEqual([OWNED]);
  });

  it("never hands an SVG to the resizer", async () => {
    publisherAnswers(
      () =>
        new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", {
          headers: { "content-type": "image/svg+xml; charset=utf-8" },
        })
    );
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(transforms).toEqual([]);
  });

  it("refuses a source whose Content-Length is over the cap", async () => {
    publisherAnswers(
      () =>
        new Response("tiny", {
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(MAX_THUMB_SOURCE_BYTES + 1),
          },
        })
    );
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(transforms).toEqual([]);
  });

  it("stops reading a source without Content-Length once it passes the cap", async () => {
    const chunk = new Uint8Array(1_000_000);
    const chunks = Math.ceil(MAX_THUMB_SOURCE_BYTES / chunk.byteLength) + 4;
    let pulls = 0;
    let cancelled = false;
    publisherAnswers(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulls += 1;
              if (pulls > chunks) controller.close();
              else controller.enqueue(chunk);
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "content-type": "image/jpeg" } }
        )
    );
    const res = await call(OWNED);
    expect(res.status).toBe(302);
    expect(transforms).toEqual([]);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(chunks);
  });

  it("gives up on a source that sends headers then stalls the body", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        fetched.push(url);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(16));
            init.signal?.addEventListener("abort", () =>
              controller.error(new Error("aborted"))
            );
          },
        });
        return new Response(body, {
          headers: { "content-type": "image/jpeg" },
        });
      })
    );
    const pending = call(OWNED);
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS + 1);
    vi.useRealTimers();
    const outcome = await Promise.race([
      pending,
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 200)),
    ]);
    expect(outcome).not.toBe("hung");
    expect((outcome as Response).status).toBe(302);
    expect(transforms).toEqual([]);
  });

  it("sends the browser to the publisher URL without an Images binding", async () => {
    const res = await call(OWNED, { DB: sqliteD1(sqlite) });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(OWNED);
    expect(fetched).toEqual([]);
  });
});
