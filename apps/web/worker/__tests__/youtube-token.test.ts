import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import {
  GOOGLE_TOKEN_URL,
  getYoutubeAccessToken,
  handleYoutubeBrokerRequest,
  keepYoutubeTokenAlive,
  YOUTUBE_TOKEN_ALERT_KEY,
  YoutubeTokenError,
  YT_ACCESS_KEY,
  YT_REFRESH_BASE_KEY,
  YT_REFRESH_KEY,
  YT_STATUS_KEY,
} from "../youtube-token.js";

const NOW = Date.UTC(2026, 10, 25, 12);
const ACCESS = ["ya29", "access", "one"].join(".");
const ACCESS2 = ["ya29", "access", "two"].join(".");
const REFRESH_ENV = ["1", "env", "refresh"].join("//");
const REFRESH_KV = ["1", "kv", "refresh"].join("//");
const REFRESH_NEW = ["1", "rotated", "refresh"].join("//");
const CLIENT_SECRET = ["client", "secret", "value"].join("-");
const BROKER = ["broker", "bearer", "value"].join("-");

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function kv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const puts: { key: string; ttl?: number }[] = [];
  const ns = {
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string, o?: { expirationTtl?: number }) => {
      data.set(key, value);
      puts.push({ key, ttl: o?.expirationTtl });
    },
  };
  return { ns: ns as unknown as KVNamespace, data, puts };
}

function makeEnv(store: ReturnType<typeof kv>, extra: Partial<Env> = {}): Env {
  return {
    HTML_CACHE: store.ns,
    YOUTUBE_CLIENT_ID: "client-id",
    YOUTUBE_CLIENT_SECRET: CLIENT_SECRET,
    YOUTUBE_REFRESH_TOKEN: REFRESH_ENV,
    ...extra,
  } as Env;
}

function google(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json(body, { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof google>) =>
  new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));

afterEach(() => vi.unstubAllGlobals());

describe("getYoutubeAccessToken", () => {
  it("refreshes against the pinned Google URL with the env refresh token and caches it", async () => {
    const store = kv();
    const f = google(200, { access_token: ACCESS, expires_in: 3600 });
    const out = await getYoutubeAccessToken(makeEnv(store), { nowMs: NOW });
    expect(f.mock.calls[0]?.[0]).toBe(GOOGLE_TOKEN_URL);
    expect(sent(f).get("refresh_token")).toBe(REFRESH_ENV);
    expect(sent(f).get("grant_type")).toBe("refresh_token");
    expect(out).toEqual({ accessToken: ACCESS, expiresInSec: 3600 });
    expect(store.puts.find((p) => p.key === YT_ACCESS_KEY)?.ttl).toBe(3600);
    expect(JSON.parse(store.data.get(YT_STATUS_KEY) ?? "{}").lastOkMs).toBe(
      NOW
    );
  });

  it("serves the cache until 5 minutes before expiry, then refreshes", async () => {
    const store = kv();
    const f = google(200, { access_token: ACCESS, expires_in: 3600 });
    const env = makeEnv(store);
    await getYoutubeAccessToken(env, { nowMs: NOW });
    const cached = await getYoutubeAccessToken(env, { nowMs: NOW + 3000_000 });
    expect(cached.accessToken).toBe(ACCESS);
    expect(f).toHaveBeenCalledTimes(1);
    f.mockImplementationOnce(async () =>
      Response.json({ access_token: ACCESS2, expires_in: 3600 })
    );
    const next = await getYoutubeAccessToken(env, { nowMs: NOW + 3400_000 });
    expect(next.accessToken).toBe(ACCESS2);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("reads the KV refresh token before the env one and stores a rotated one", async () => {
    const store = kv({
      [YT_REFRESH_KEY]: REFRESH_KV,
      [YT_REFRESH_BASE_KEY]: await sha256(REFRESH_ENV),
    });
    const f = google(200, {
      access_token: ACCESS,
      expires_in: 3600,
      refresh_token: REFRESH_NEW,
    });
    await getYoutubeAccessToken(makeEnv(store), { nowMs: NOW });
    expect(sent(f).get("refresh_token")).toBe(REFRESH_KV);
    expect(store.data.get(YT_REFRESH_KEY)).toBe(REFRESH_NEW);
    expect(store.data.get(YT_REFRESH_BASE_KEY)).toBe(await sha256(REFRESH_ENV));
  });

  it("prefers a re-minted Worker secret over a stale rotated token in KV", async () => {
    const store = kv({
      [YT_REFRESH_KEY]: REFRESH_KV,
      [YT_REFRESH_BASE_KEY]: await sha256("an-older-env-token"),
    });
    const f = google(200, { access_token: ACCESS, expires_in: 3600 });
    await getYoutubeAccessToken(makeEnv(store), { nowMs: NOW });
    expect(sent(f).get("refresh_token")).toBe(REFRESH_ENV);
  });

  it("types invalid_grant, records the code and never leaks Google's body", async () => {
    const store = kv();
    google(400, { error: "invalid_grant", error_description: REFRESH_ENV });
    const err = await getYoutubeAccessToken(makeEnv(store), {
      nowMs: NOW,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(YoutubeTokenError);
    expect(err.code).toBe("invalid_grant");
    expect(err.message).not.toContain(REFRESH_ENV);
    const status = JSON.parse(store.data.get(YT_STATUS_KEY) ?? "{}");
    expect(status.lastErrorCode).toBe("invalid_grant");
    expect(JSON.stringify([...store.data.values()])).not.toContain(
      CLIENT_SECRET
    );
  });

  it("is not_configured without the client or any refresh token", async () => {
    const f = google(200, {});
    const env = makeEnv(kv(), { YOUTUBE_REFRESH_TOKEN: undefined });
    await expect(getYoutubeAccessToken(env)).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("keepYoutubeTokenAlive", () => {
  it("refreshes when the last ok is over a day old and skips when it is fresh", async () => {
    const store = kv({
      [YT_STATUS_KEY]: JSON.stringify({ lastOkMs: NOW - 3600_000 }),
    });
    const f = google(200, { access_token: ACCESS, expires_in: 3600 });
    expect(await keepYoutubeTokenAlive(makeEnv(store), NOW)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(
      await keepYoutubeTokenAlive(makeEnv(store), NOW + 25 * 3600_000)
    ).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("raises an actionable alert on invalid_grant and stays quiet on other failures", async () => {
    google(400, { error: "invalid_grant" });
    const issue = await keepYoutubeTokenAlive(makeEnv(kv()), NOW);
    expect(issue?.key).toBe(YOUTUBE_TOKEN_ALERT_KEY);
    expect(issue?.evidence?.join("\n")).toContain(
      "wrangler secret put YOUTUBE_REFRESH_TOKEN"
    );
    expect(issue?.evidence?.join("\n")).toContain("In production");
    google(500, { error: "backend_error" });
    expect(await keepYoutubeTokenAlive(makeEnv(kv()), NOW)).toBeNull();
  });

  it("does nothing when YouTube is not configured on the Worker", async () => {
    const f = google(200, {});
    expect(
      await keepYoutubeTokenAlive({ HTML_CACHE: kv().ns } as Env, NOW)
    ).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("handleYoutubeBrokerRequest", () => {
  const req = (auth?: string, method = "POST") =>
    new Request("https://aidr.test/api/internal/youtube-token", {
      method,
      headers: auth ? { authorization: auth } : {},
    });

  it("is a 404 while YOUTUBE_BROKER_SECRET is unset", async () => {
    const res = await handleYoutubeBrokerRequest(
      req(`Bearer ${BROKER}`),
      makeEnv(kv())
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects a missing or wrong bearer", async () => {
    const env = makeEnv(kv(), { YOUTUBE_BROKER_SECRET: BROKER });
    expect((await handleYoutubeBrokerRequest(req(), env)).status).toBe(401);
    expect(
      (await handleYoutubeBrokerRequest(req("Bearer nope"), env)).status
    ).toBe(401);
  });

  it("returns only the access token and its lifetime", async () => {
    google(200, {
      access_token: ACCESS,
      expires_in: 3600,
      refresh_token: REFRESH_NEW,
    });
    const env = makeEnv(kv(), { YOUTUBE_BROKER_SECRET: BROKER });
    const res = await handleYoutubeBrokerRequest(req(`Bearer ${BROKER}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      access_token: ACCESS,
      expires_in: 3600,
    });
    for (const secret of [REFRESH_NEW, REFRESH_ENV, CLIENT_SECRET])
      expect(text).not.toContain(secret);
  });

  it("answers a code only when Google refuses", async () => {
    google(400, { error: "invalid_grant", error_description: REFRESH_ENV });
    const env = makeEnv(kv(), { YOUTUBE_BROKER_SECRET: BROKER });
    const res = await handleYoutubeBrokerRequest(req(`Bearer ${BROKER}`), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "invalid_grant" });
  });
});
