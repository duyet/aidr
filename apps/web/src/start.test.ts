import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "subscribe-test-token";

// A production-instance key pair that only exists in this test. `pk_live_`
// selects Clerk's production code path; the host never resolves.
const PUBLISHABLE_KEY = `pk_live_${Buffer.from("clerk.example.invalid$").toString("base64")}`;
const SECRET_KEY = "sk_live_test_only_not_a_real_key";

// A reader who signed in before: Clerk's `__client_uat` cookie is set and the
// short-lived `__session` cookie is gone. Clerk answers a document request
// with that pair by redirecting to its handshake endpoint.
function documentRequest(path: string): Request {
  return new Request(`https://aidr.test${path}`, {
    headers: {
      Accept: "text/html",
      "Sec-Fetch-Dest": "document",
      Cookie: "__client_uat=1700000000",
    },
  });
}

type Outcome = { redirect: string | null; reachedApp: boolean };

async function runRequestMiddleware(path: string): Promise<Outcome> {
  vi.resetModules();
  const { startInstance } = await import("./start");
  const options = await startInstance.getOptions();
  const middlewares = options.requestMiddleware ?? [];
  expect(middlewares.length).toBeGreaterThan(0);

  const request = documentRequest(path);
  let reachedApp = false;
  const dispatch = async (index: number): Promise<unknown> => {
    const server = middlewares[index]?.options.server;
    if (!server) {
      reachedApp = true;
      return { request, pathname: path, context: {}, response: new Response() };
    }
    return server({
      request,
      pathname: new URL(request.url).pathname,
      context: {},
      next: (() => dispatch(index + 1)) as never,
    } as never);
  };

  try {
    await dispatch(0);
    return { redirect: null, reachedApp };
  } catch (thrown) {
    if (thrown instanceof Response) {
      return { redirect: thrown.headers.get("Location"), reachedApp };
    }
    throw thrown;
  }
}

describe("Clerk request middleware", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_SECRET_KEY", SECRET_KEY);
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network is off in this test");
      })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    "/sign-in",
    "/data?settings=1",
    "/mail",
    "/api/admin/status?settings=1",
    "/api/subscribe/preview?token=1",
  ])(
    "sends a returning reader on %s through Clerk's handshake",
    async (path) => {
      const outcome = await runRequestMiddleware(path);

      expect(outcome.redirect).toContain("/v1/client/handshake");
      expect(outcome.reachedApp).toBe(false);
    }
  );

  // A returning reader on a public page used to be sent to the handshake, and
  // a browser that dropped the cookies on those 307s looped until Safari gave
  // up with "too many redirects". Reader pages never read auth.
  it.each([
    "/7f181e7a?lang=en&utm_source=telegram&utm_medium=social&utm_campaign=story&utm_content=button-7f181e7a",
    "/?tab=week",
    "/about",
    "/subscribe?lang=vi",
    "/feedback?d=2026-10-14&l=en&v=1",
  ])("serves a returning reader on %s without a handshake", async (path) => {
    const outcome = await runRequestMiddleware(path);

    expect(outcome.redirect).toBeNull();
    expect(outcome.reachedApp).toBe(true);
  });

  // Every GET link a subscriber receives by mail, plus case and slash
  // variants the router still matches.
  it.each([
    "/subscribe?settings=",
    "/subscribe?unsubscribe=",
    "/subscribe/?settings=",
    "/subscribe?lang=vi&settings=",
    "/Subscribe?settings=",
    "/SUBSCRIBE/?unsubscribe=",
    "/api/subscribe/confirm?token=",
    "/api/subscribe?token=",
    "/API/Subscribe?token=",
    "/feedback?d=2026-10-14&l=en&v=1&t=",
  ])(
    "keeps the subscriber token out of any redirect for %s<token>",
    async (prefix) => {
      const outcome = await runRequestMiddleware(`${prefix}${TOKEN}`);

      expect(outcome.redirect ?? "").not.toContain(TOKEN);
      expect(outcome.reachedApp).toBe(true);
    }
  );

  it("builds start options in the client bundle, where Clerk is a stub", async () => {
    vi.resetModules();
    vi.stubEnv("DEV", false);
    vi.doMock(
      "@clerk/tanstack-react-start/server",
      () => import("./lib/clerk-server-stub")
    );
    try {
      const { startInstance } = await import("./start");
      expect(await startInstance.getOptions()).toBeDefined();
    } finally {
      vi.doUnmock("@clerk/tanstack-react-start/server");
    }
  });
});
