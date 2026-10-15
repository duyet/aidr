import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./read";

type Post = (args: { request: Request; context: unknown }) => Promise<Response>;

const post = (Route.options.server as unknown as { handlers: { POST: Post } })
  .handlers.POST;

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function beacon(): Request {
  return new Request("https://aidr.today/api/read", {
    method: "POST",
    headers: { "User-Agent": BROWSER, "Content-Type": "text/plain" },
    body: JSON.stringify({
      item_id: "a".repeat(64),
      kind: "open",
      channel: "web",
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/read", () => {
  it("answers 204 when D1 throws, e.g. before migration 0065 (defect: a counter error reaches readers)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const DB = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ 1: 1 }),
          run: async () => {
            throw new Error("D1_ERROR: no such table: item_reads");
          },
        }),
      }),
    };
    const res = await post({ request: beacon(), context: { env: { DB } } });
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(error).toHaveBeenCalledOnce();
  });

  it("answers 204 and counts nothing when the rate limiter throws (defect: a limiter outage counts every beacon unlimited)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new DatabaseSync(":memory:");
    raw.exec("CREATE TABLE items (id TEXT PRIMARY KEY, status TEXT)");
    raw.exec(
      readFileSync(
        new URL("../../../migrations/0065_item_reads.sql", import.meta.url),
        "utf8"
      )
    );
    raw
      .prepare("INSERT INTO items VALUES (?, 'published')")
      .run("a".repeat(64));
    const DB = {
      prepare: (sql: string) => ({
        bind: (...args: never[]) => ({
          first: async () => raw.prepare(sql).get(...args) ?? null,
          run: async () => ({
            meta: { changes: Number(raw.prepare(sql).run(...args).changes) },
          }),
        }),
      }),
    };
    const READ_LIMITER = {
      limit: async () => {
        throw new Error("rate limiter unavailable");
      },
    };
    const request = beacon();
    request.headers.set("CF-Connecting-IP", "198.51.100.7");
    const res = await post({ request, context: { env: { DB, READ_LIMITER } } });
    expect(res.status).toBe(204);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_reads").get()).toEqual({
      n: 0,
    });
  });

  it("answers a bad body with 400 invalid_read", async () => {
    const res = await post({
      request: new Request("https://aidr.today/api/read", {
        method: "POST",
        headers: { "User-Agent": BROWSER },
        body: "{",
      }),
      context: { env: { DB: {} } },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_read" });
  });
});
