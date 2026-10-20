import { describe, expect, it, vi } from "vitest";
import {
  checkAdminAuth,
  checkAdminAuthRateLimit,
  classifyBearer,
} from "../admin/auth.js";
import { verifyClerkToken } from "../admin/clerk.js";
import type { Env } from "../types.js";

vi.mock("../admin/clerk.js", async (orig) => ({
  ...(await orig<typeof import("../admin/clerk.js")>()),
  verifyClerkToken: vi.fn(async () => null),
}));

const readerPayload = {
  sub: "user_reader",
  iss: "https://clerk.example.test",
  exp: 4_000_000_000,
};

function makeRateLimitDb(count: number) {
  const inserts: unknown[][] = [];
  return {
    db: {
      prepare(sql: string) {
        return {
          bind: (...args: unknown[]) => ({
            first: async () => (sql.includes("COUNT(*)") ? { count } : null),
            run: async () => {
              if (sql.includes("INSERT INTO subscribe_attempts")) {
                inserts.push(args);
              }
              return { meta: { changes: 1 } };
            },
          }),
        };
      },
    } as unknown as D1Database,
    inserts,
  };
}

describe("checkAdminAuth rate limit", () => {
  it("returns 429 when failure budget is exhausted", async () => {
    const { db } = makeRateLimitDb(10);
    const env = { DB: db, NEWS_ADMIN_TOKEN: "secret" } as Env;
    const req = new Request("https://news.duyet.net/api/admin/items", {
      headers: {
        Authorization: "Bearer wrong",
        "CF-Connecting-IP": "203.0.113.1",
      },
    });
    const limited = await checkAdminAuthRateLimit(req, env);
    expect(limited?.status).toBe(429);
  });

  it("records failed auth attempts", async () => {
    const { db, inserts } = makeRateLimitDb(0);
    const env = { DB: db, NEWS_ADMIN_TOKEN: "secret" } as Env;
    const req = new Request("https://news.duyet.net/api/admin/items", {
      headers: {
        Authorization: "Bearer wrong",
        "CF-Connecting-IP": "203.0.113.1",
      },
    });
    const res = await checkAdminAuth(req, env);
    expect(res?.status).toBe(401);
    expect(inserts.length).toBe(1);
  });

  it("answers 401 without counting a failure for a valid non-admin session", async () => {
    vi.mocked(verifyClerkToken).mockResolvedValueOnce(readerPayload);
    const { db, inserts } = makeRateLimitDb(0);
    const env = { DB: db, NEWS_ADMIN_TOKEN: "secret" } as Env;
    const req = new Request("https://news.duyet.net/api/admin/items", {
      headers: {
        Authorization: "Bearer reader-session",
        "CF-Connecting-IP": "203.0.113.1",
      },
    });
    const res = await checkAdminAuth(req, env);
    expect(res?.status).toBe(401);
    expect(inserts.length).toBe(0);
  });
});

describe("classifyBearer", () => {
  const env = { DB: {} as D1Database, NEWS_ADMIN_TOKEN: "secret" } as Env;
  const withBearer = (token?: string) =>
    new Request("https://news.duyet.net/api/admin/me", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  it("is admin for the static token", async () => {
    expect(await classifyBearer(withBearer("secret"), env)).toBe("admin");
  });

  it("is reader for a valid non-admin Clerk session", async () => {
    vi.mocked(verifyClerkToken).mockResolvedValueOnce(readerPayload);
    expect(await classifyBearer(withBearer("jwt"), env)).toBe("reader");
  });

  it("is admin for a valid admin Clerk session", async () => {
    vi.mocked(verifyClerkToken).mockResolvedValueOnce(readerPayload);
    const adminEnv = { ...env, NEWS_ADMIN_USER_IDS: "user_reader" } as Env;
    expect(await classifyBearer(withBearer("jwt"), adminEnv)).toBe("admin");
  });

  it("is invalid for an unknown bearer and for none", async () => {
    expect(await classifyBearer(withBearer("wrong"), env)).toBe("invalid");
    expect(await classifyBearer(withBearer(), env)).toBe("invalid");
  });
});
