import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types.js";
import {
  handleYoutubeAuthCallback,
  handleYoutubeAuthStart,
} from "../youtube-auth.js";
import {
  linkNonceKey,
  maxTokenAgeMs,
  sendYoutubeOwnerMail,
  signPayload,
  stateNonceKey,
  verifyPayload,
} from "../youtube-auth-link.js";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  YT_ACCESS_KEY,
  YT_CLIENT_KEY,
  YT_MINTED_KEY,
  YT_REFRESH_BASE_KEY,
  YT_REFRESH_KEY,
  YT_STATUS_KEY,
} from "../youtube-keys.js";
import {
  getYoutubeAccessToken,
  keepYoutubeTokenAlive,
} from "../youtube-token.js";

const NOW = Date.UTC(2026, 10, 25, 12);
const DAY = 24 * 3600 * 1000;
const BROKER = ["broker", "secret", "value"].join("-");
const WEB_SECRET = ["web", "client", "secret"].join("-");
const DESKTOP_SECRET = ["desktop", "client", "secret"].join("-");
const REFRESH_ENV = ["1", "env", "refresh"].join("//");
const REFRESH_NEW = ["1", "minted", "refresh"].join("//");
const ACCESS = ["ya29", "access", "one"].join(".");
const CODE = ["4", "auth", "code"].join("/");
const CHANNEL = "UCGDB5uD8znydgMg2XLOj04w";

function kv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const ns = {
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => void data.set(key, value),
    delete: async (key: string) => void data.delete(key),
  };
  return { ns: ns as unknown as KVNamespace, data };
}

function makeEnv(store: ReturnType<typeof kv>, extra: Partial<Env> = {}) {
  const send = vi.fn(async (_m: unknown) => ({}));
  const env = {
    HTML_CACHE: store.ns,
    EMAIL: { send },
    OWNER_NOTIFY_EMAIL: "owner@example.com",
    YOUTUBE_BROKER_SECRET: BROKER,
    YOUTUBE_CLIENT_ID: "desktop-id",
    YOUTUBE_CLIENT_SECRET: DESKTOP_SECRET,
    YOUTUBE_WEB_CLIENT_ID: "web-id",
    YOUTUBE_WEB_CLIENT_SECRET: WEB_SECRET,
    YOUTUBE_REFRESH_TOKEN: REFRESH_ENV,
    ...extra,
  } as Env;
  return { env, send };
}

const firstMail = (send: ReturnType<typeof makeEnv>["send"]) =>
  (send.mock.calls[0]?.[0] ?? {}) as { subject?: string; text?: string };

const linkFrom = (send: ReturnType<typeof makeEnv>["send"]) => {
  const text = String(firstMail(send).text);
  return new URL(text.match(/https:\/\/\S+/)?.[0] ?? "");
};

afterEach(() => vi.unstubAllGlobals());

describe("signed payloads", () => {
  it("verify only for the same secret, purpose and before expiry", async () => {
    const t = await signPayload(BROKER, "link", "n1", NOW + 1000);
    expect(await verifyPayload(BROKER, t, "link", NOW)).toEqual({ n: "n1" });
    expect(await verifyPayload("other", t, "link", NOW)).toBeNull();
    expect(await verifyPayload(BROKER, t, "state", NOW)).toBeNull();
    expect(await verifyPayload(BROKER, t, "link", NOW + 1000)).toBeNull();
    expect(await verifyPayload(BROKER, `${t}x`, "link", NOW)).toBeNull();
    expect(await verifyPayload(BROKER, null, "link", NOW)).toBeNull();
  });
});

describe("maxTokenAgeMs", () => {
  it("defaults to 5 days and 0 turns it off", () => {
    expect(maxTokenAgeMs({} as Env)).toBe(5 * DAY);
    expect(maxTokenAgeMs({ YOUTUBE_TOKEN_MAX_AGE_DAYS: "3" } as Env)).toBe(
      3 * DAY
    );
    expect(maxTokenAgeMs({ YOUTUBE_TOKEN_MAX_AGE_DAYS: "0" } as Env)).toBe(0);
  });
});

describe("owner mail", () => {
  it("sends a link to the owner and dedupes per reason for 24h", async () => {
    const { env, send } = makeEnv(kv());
    expect(await sendYoutubeOwnerMail(env, "expiring", NOW)).toBe(true);
    expect(await sendYoutubeOwnerMail(env, "expiring", NOW + 1000)).toBe(false);
    expect(await sendYoutubeOwnerMail(env, "rejected", NOW)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    const mail = send.mock.calls[0]?.[0] as { to: string; subject: string };
    expect(mail.to).toBe("owner@example.com");
    const link = linkFrom(send);
    expect(link.origin + link.pathname).toBe(
      "https://aidr.today/api/internal/youtube-auth/start"
    );
    expect(
      await verifyPayload(BROKER, link.searchParams.get("t"), "link", NOW)
    ).not.toBeNull();
  });

  it("never throws when the mailer fails and does not dedupe a failed send", async () => {
    const { env, send } = makeEnv(kv());
    send.mockRejectedValueOnce(new Error("down"));
    expect(await sendYoutubeOwnerMail(env, "expiring", NOW)).toBe(false);
    expect(await sendYoutubeOwnerMail(env, "expiring", NOW)).toBe(true);
  });

  it("stays quiet without an owner address, mailer or broker secret", async () => {
    for (const extra of [
      { OWNER_NOTIFY_EMAIL: "" },
      { EMAIL: undefined },
      { YOUTUBE_BROKER_SECRET: undefined },
    ] as Partial<Env>[]) {
      const { env } = makeEnv(kv(), extra);
      expect(await sendYoutubeOwnerMail(env, "rejected", NOW)).toBe(false);
    }
  });
});

describe("keepYoutubeTokenAlive warnings", () => {
  function refreshOk() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ access_token: ACCESS, expires_in: 3600 })
      )
    );
  }
  const stored = (minted?: number) => ({
    [YT_REFRESH_KEY]: REFRESH_NEW,
    [YT_REFRESH_BASE_KEY]: "",
    ...(minted === undefined ? {} : { [YT_MINTED_KEY]: String(minted) }),
  });

  it("does not warn when no mint time is recorded", async () => {
    refreshOk();
    const { env, send } = makeEnv(kv(), { YOUTUBE_REFRESH_TOKEN: undefined });
    await keepYoutubeTokenAlive(env, NOW);
    expect(send).not.toHaveBeenCalled();
  });

  it("warns at the max age, not before, and not when set to 0", async () => {
    refreshOk();
    const young = makeEnv(kv(stored(NOW - 4 * DAY)), {
      YOUTUBE_REFRESH_TOKEN: undefined,
    });
    await keepYoutubeTokenAlive(young.env, NOW);
    expect(young.send).not.toHaveBeenCalled();
    const old = makeEnv(kv(stored(NOW - 5 * DAY)), {
      YOUTUBE_REFRESH_TOKEN: undefined,
    });
    await keepYoutubeTokenAlive(old.env, NOW);
    expect(old.send).toHaveBeenCalledTimes(1);
    const off = makeEnv(kv(stored(NOW - 9 * DAY)), {
      YOUTUBE_REFRESH_TOKEN: undefined,
      YOUTUBE_TOKEN_MAX_AGE_DAYS: "0",
    });
    await keepYoutubeTokenAlive(off.env, NOW);
    expect(off.send).not.toHaveBeenCalled();
  });

  it("emails on invalid_grant and still returns the alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "invalid_grant" }, { status: 400 })
      )
    );
    const { env, send } = makeEnv(kv());
    const issue = await keepYoutubeTokenAlive(env, NOW);
    expect(issue?.key).toBe("youtube-token-invalid");
    expect(send).toHaveBeenCalledTimes(1);
    expect(firstMail(send).subject).toContain("stopped");
  });
});

describe("start", () => {
  async function started(extra: Partial<Env> = {}) {
    const store = kv();
    const made = makeEnv(store, extra);
    await sendYoutubeOwnerMail(made.env, "expiring", NOW);
    const link = linkFrom(made.send);
    return { ...made, store, link };
  }

  it("404s while the broker secret is unset", async () => {
    const res = await handleYoutubeAuthStart(
      new Request("https://aidr.today/api/internal/youtube-auth/start"),
      { HTML_CACHE: kv().ns } as Env
    );
    expect(res.status).toBe(404);
  });

  it("redirects to the pinned Google URL, and a second open (a mail scanner) still works", async () => {
    const { env, link } = await started();
    const res = await handleYoutubeAuthStart(new Request(link), env, NOW);
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const to = new URL(res.headers.get("location") ?? "");
    expect(to.origin + to.pathname).toBe(GOOGLE_AUTH_URL);
    expect(to.searchParams.get("client_id")).toBe("web-id");
    expect(to.searchParams.get("redirect_uri")).toBe(
      "https://aidr.today/api/internal/youtube-auth/callback"
    );
    expect(to.searchParams.get("access_type")).toBe("offline");
    expect(to.searchParams.get("prompt")).toBe("consent");
    expect(to.searchParams.get("include_granted_scopes")).toBe("false");
    expect(to.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube"
    );
    const again = await handleYoutubeAuthStart(new Request(link), env, NOW);
    expect(again.status).toBe(302);
  });

  it("falls back to the Desktop client when no web client is set", async () => {
    const { env, link } = await started({
      YOUTUBE_WEB_CLIENT_ID: undefined,
      YOUTUBE_WEB_CLIENT_SECRET: undefined,
    });
    const res = await handleYoutubeAuthStart(new Request(link), env, NOW);
    expect(
      new URL(res.headers.get("location") ?? "").searchParams.get("client_id")
    ).toBe("desktop-id");
  });

  it("400s a forged, wrong or expired link", async () => {
    const { env, link } = await started();
    const url = new URL(link);
    for (const t of ["x.y", `${link.searchParams.get("t")}z`, null]) {
      const u = new URL(url);
      if (t) u.searchParams.set("t", t);
      else u.searchParams.delete("t");
      expect(
        (await handleYoutubeAuthStart(new Request(u), env, NOW)).status
      ).toBe(400);
    }
    const late = await handleYoutubeAuthStart(
      new Request(link),
      env,
      NOW + 25 * 3600 * 1000
    );
    expect(late.status).toBe(400);
  });
});

describe("callback", () => {
  async function ready(
    extra: Partial<Env> = {},
    seed: Record<string, string> = {}
  ) {
    const store = kv(seed);
    const made = makeEnv(store, extra);
    await sendYoutubeOwnerMail(made.env, "expiring", NOW);
    const start = await handleYoutubeAuthStart(
      new Request(linkFrom(made.send)),
      made.env,
      NOW
    );
    const state =
      new URL(start.headers.get("location") ?? "").searchParams.get("state") ??
      "";
    const cb = (qs: Record<string, string>) =>
      new Request(
        `https://aidr.today/api/internal/youtube-auth/callback?${new URLSearchParams(qs)}`
      );
    return { ...made, store, state, cb };
  }

  function google(
    channelIds: string[],
    tokenBody: unknown = {
      access_token: ACCESS,
      refresh_token: REFRESH_NEW,
      expires_in: 3600,
    }
  ) {
    const f = vi.fn(async (url: string, _init?: RequestInit) =>
      String(url) === GOOGLE_TOKEN_URL
        ? Response.json(tokenBody)
        : Response.json({ items: channelIds.map((id) => ({ id })) })
    );
    vi.stubGlobal("fetch", f);
    return f;
  }

  it("stores the token for the right channel and clears the cache and status", async () => {
    const { env, store, state, cb, send } = await ready(
      {},
      {
        [YT_ACCESS_KEY]: "cached",
        [YT_STATUS_KEY]: JSON.stringify({
          lastErrorCode: "invalid_grant",
          lastOkMs: 1,
        }),
      }
    );
    const f = google([CHANNEL]);
    const res = await handleYoutubeAuthCallback(
      cb({ code: CODE, state }),
      env,
      NOW + 1000
    );
    expect(res.status).toBe(200);
    // The link is used up by a completed sign-in, not by opening it.
    expect(
      (await handleYoutubeAuthStart(new Request(linkFrom(send)), env, NOW))
        .status
    ).toBe(410);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).not.toContain(REFRESH_NEW);
    expect(body).not.toContain(CODE);
    const sent = new URLSearchParams(String(f.mock.calls[0]?.[1]?.body));
    expect(sent.get("code")).toBe(CODE);
    expect(sent.get("client_id")).toBe("web-id");
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(f.mock.calls[1]?.[0]).toContain("part=id&mine=true");
    expect(store.data.get(YT_REFRESH_KEY)).toBe(REFRESH_NEW);
    expect(store.data.get(YT_MINTED_KEY)).toBe(String(NOW + 1000));
    expect(store.data.get(YT_CLIENT_KEY)).toBe("web-id");
    expect(store.data.get(YT_REFRESH_BASE_KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(store.data.has(YT_ACCESS_KEY)).toBe(false);
    expect(
      JSON.parse(store.data.get(YT_STATUS_KEY) ?? "{}").lastErrorCode
    ).toBeUndefined();
  });

  it("the stored token wins over the env one and refreshes with the web client", async () => {
    const { env, state, cb } = await ready();
    const f = google([CHANNEL]);
    await handleYoutubeAuthCallback(cb({ code: CODE, state }), env, NOW);
    f.mockClear();
    f.mockImplementation(async () =>
      Response.json({ access_token: ACCESS, expires_in: 3600 })
    );
    await getYoutubeAccessToken(env, { nowMs: NOW, force: true });
    const sent = new URLSearchParams(String(f.mock.calls[0]?.[1]?.body));
    expect(sent.get("refresh_token")).toBe(REFRESH_NEW);
    expect(sent.get("client_id")).toBe("web-id");
    expect(sent.get("client_secret")).toBe(WEB_SECRET);
  });

  it("rejects an account that does not own the channel and stores nothing", async () => {
    const { env, store, state, cb } = await ready();
    google(["UCsomeoneelse"]);
    const res = await handleYoutubeAuthCallback(
      cb({ code: CODE, state }),
      env,
      NOW
    );
    expect(res.status).toBe(403);
    expect(store.data.has(YT_REFRESH_KEY)).toBe(false);
  });

  it("honours YOUTUBE_CHANNEL_ID", async () => {
    const { env, store, state, cb } = await ready({
      YOUTUBE_CHANNEL_ID: "UCcustom",
    });
    google(["UCcustom"]);
    expect(
      (await handleYoutubeAuthCallback(cb({ code: CODE, state }), env, NOW))
        .status
    ).toBe(200);
    expect(store.data.get(YT_REFRESH_KEY)).toBe(REFRESH_NEW);
  });

  it("burns the state: a second callback is 410 and calls Google once", async () => {
    const { env, state, cb } = await ready();
    const f = google([CHANNEL]);
    await handleYoutubeAuthCallback(cb({ code: CODE, state }), env, NOW);
    const calls = f.mock.calls.length;
    const again = await handleYoutubeAuthCallback(
      cb({ code: CODE, state }),
      env,
      NOW
    );
    expect(again.status).toBe(410);
    expect(f.mock.calls.length).toBe(calls);
  });

  it("400s a bad state and a state never issued by start", async () => {
    const { env, cb } = await ready();
    const f = google([CHANNEL]);
    expect(
      (
        await handleYoutubeAuthCallback(
          cb({ code: CODE, state: "bad" }),
          env,
          NOW
        )
      ).status
    ).toBe(400);
    const forged = await signPayload(
      BROKER,
      "state",
      "never-issued",
      NOW + 1000
    );
    expect(
      (
        await handleYoutubeAuthCallback(
          cb({ code: CODE, state: forged }),
          env,
          NOW
        )
      ).status
    ).toBe(410);
    expect(f).not.toHaveBeenCalled();
  });

  it("stores nothing when Google gives no refresh token or the user declines", async () => {
    const a = await ready();
    google([CHANNEL], { access_token: ACCESS });
    const res = await handleYoutubeAuthCallback(
      a.cb({ code: CODE, state: a.state }),
      a.env,
      NOW
    );
    expect(res.status).toBe(502);
    expect(a.store.data.has(YT_REFRESH_KEY)).toBe(false);
    const b = await ready();
    const denied = await handleYoutubeAuthCallback(
      b.cb({ error: "access_denied", state: b.state }),
      b.env,
      NOW
    );
    expect(denied.status).toBe(400);
  });

  it("404s while the broker secret is unset", async () => {
    const res = await handleYoutubeAuthCallback(
      new Request("https://aidr.today/api/internal/youtube-auth/callback"),
      { HTML_CACHE: kv().ns } as Env
    );
    expect(res.status).toBe(404);
  });
});

describe("nonce keys", () => {
  it("keeps link and state nonces apart", () => {
    expect(linkNonceKey("a")).not.toBe(stateNonceKey("a"));
  });
});
