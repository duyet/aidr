import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClerkProxyUrl } from "../../src/lib/clerk-proxy-config.js";
import {
  buildClerkProxyTarget,
  CLERK_FAPI_ORIGIN,
  CLERK_PROXY_PATH,
  type ClerkProxyEnv,
  handleClerkProxy,
  isClerkProxyPath,
} from "../clerk-proxy.js";

const PUBLIC_PROXY_URL = "https://aidr.today/__clerk";
const AUTHORITY_PATHS = [
  "/__clerk//evil.example/steal",
  "/__clerk/%2f%2fevil.example/steal",
  "/__clerk/%2F%5Cevil.example/steal",
  "/__clerk/%252f%252fevil.example/steal",
  "/__clerk/\\\\evil.example/steal",
  "/__clerk//user:password@evil.example/steal",
  "/__clerk/https://user:password@evil.example/steal",
  "/__clerk/https://frontend-api.clerk.dev.evil.example/steal",
];
const NESTED_ENCODING_PATHS = [
  "/__clerk/%252525252525252f%252525252525252fevil.example/steal",
  "/__clerk/%25%32%66%25%32%66evil.example/steal",
  "/__clerk/%255c%255cevil.example/steal",
];
const MALFORMED_PATHS = [
  "/__clerk/%",
  "/__clerk/%zz",
  "/__clerk/%E0%A4%A",
  "/__clerk/%2%66evil.example/steal",
];

function proxyRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://aidr.today${path}`, init);
}

function makeEnv(overrides: Partial<ClerkProxyEnv> = {}): ClerkProxyEnv {
  return {
    CLERK_SECRET_KEY: "server-secret",
    CLERK_PROXY_URL: PUBLIC_PROXY_URL,
    ...overrides,
  };
}

function mockFetch(response = new Response("ok")): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function redirectResponse(location: string, status = 302): Response {
  return new Response("upstream redirect", {
    status,
    headers: { Location: location },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isClerkProxyPath", () => {
  it("matches the proxy root and nested Clerk asset paths", () => {
    expect(isClerkProxyPath(CLERK_PROXY_PATH)).toBe(true);
    expect(
      isClerkProxyPath(
        `${CLERK_PROXY_PATH}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`
      )
    ).toBe(true);
    expect(isClerkProxyPath("/api/feed")).toBe(false);
    expect(isClerkProxyPath("/__clerkish")).toBe(false);
  });
});

describe("resolveClerkProxyUrl", () => {
  it("normalizes environment-specific absolute and browser-relative URLs", () => {
    expect(resolveClerkProxyUrl("https://preview.example")).toBe(
      "https://preview.example/__clerk"
    );
    expect(resolveClerkProxyUrl("http://localhost:3014/__clerk/")).toBe(
      "http://localhost:3014/__clerk"
    );
    expect(resolveClerkProxyUrl("/__clerk", { allowRelative: true })).toBe(
      CLERK_PROXY_PATH
    );
  });

  it("rejects untrusted or ambiguous public URL configuration", () => {
    expect(resolveClerkProxyUrl("//evil.example")).toBeUndefined();
    expect(
      resolveClerkProxyUrl("https://user:pass@example.com")
    ).toBeUndefined();
    expect(resolveClerkProxyUrl("https://example.com/other")).toBeUndefined();
    expect(
      resolveClerkProxyUrl("https://example.com/__clerk?x=1")
    ).toBeUndefined();
  });
});

describe("buildClerkProxyTarget", () => {
  it("keeps legitimate paths and queries on the approved origin", () => {
    const target = buildClerkProxyTarget(
      proxyRequest(
        "/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js?module=1"
      )
    );

    expect(target.origin).toBe(CLERK_FAPI_ORIGIN);
    expect(target.pathname).toBe(
      "/npm/@clerk/clerk-js@6/dist/clerk.browser.js"
    );
    expect(target.search).toBe("?module=1");
    expect(target.username).toBe("");
    expect(target.password).toBe("");
  });

  it.each(AUTHORITY_PATHS)("rejects authority-like suffix %s", (path) => {
    expect(() => buildClerkProxyTarget(proxyRequest(path))).toThrow(
      "Invalid Clerk proxy path"
    );
  });

  it.each(NESTED_ENCODING_PATHS)("rejects nested encoding %s", (path) => {
    expect(() => buildClerkProxyTarget(proxyRequest(path))).toThrow(
      "Invalid Clerk proxy path"
    );
  });

  it.each(MALFORMED_PATHS)("rejects malformed suffix %s", (path) => {
    expect(() => buildClerkProxyTarget(proxyRequest(path))).toThrow(
      "Invalid Clerk proxy path"
    );
  });
});

describe("handleClerkProxy invalid paths", () => {
  it.each([...AUTHORITY_PATHS, ...NESTED_ENCODING_PATHS, ...MALFORMED_PATHS])(
    "does not fetch or expose the secret for %s",
    async (path) => {
      const fetchMock = mockFetch();
      const response = await handleClerkProxy(proxyRequest(path), makeEnv());

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});

describe("handleClerkProxy header confinement", () => {
  it("forwards intended Clerk headers, trusted metadata, and POST bodies", async () => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client?foo=bar", {
        method: "POST",
        body: "payload",
        headers: {
          Authorization: "Bearer client-token",
          "CF-Connecting-IP": "203.0.113.10",
          "Clerk-Proxy-Url": "https://attacker.example",
          "Clerk-Secret-Key": "client-secret",
          Connection: "keep-alive, X-Connection-Secret",
          Cookie: "session=client-cookie",
          "Content-Type": "application/json",
          Host: "attacker.example",
          "Keep-Alive": "timeout=5",
          "Proxy-Authorization": "Basic attacker",
          "X-Admin-Token": "must-not-leak",
          "X-Connection-Secret": "must-not-leak",
          "X-Forwarded-For": "198.51.100.1, 10.0.0.1",
          "X-Forwarded-Host": "attacker.example",
          "X-Forwarded-Proto": "http",
          "X-Real-IP": "198.51.100.1",
          Forwarded: "for=198.51.100.1",
          Upgrade: "websocket",
          "X-Clerk-Trace": "client-trace",
          "X-Client-Build": "test-build",
        },
      }),
      makeEnv()
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    const forwardedUrl = new URL(forwarded.url);

    expect(forwardedUrl.origin).toBe(CLERK_FAPI_ORIGIN);
    expect(forwardedUrl.pathname).toBe("/v1/client");
    expect(forwardedUrl.search).toBe("?foo=bar");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.redirect).toBe("manual");
    expect(await forwarded.text()).toBe("payload");
    expect(forwarded.headers.get("Authorization")).toBe("Bearer client-token");
    expect(forwarded.headers.get("Cookie")).toBe("session=client-cookie");
    expect(forwarded.headers.get("Content-Type")).toBe("application/json");
    expect(forwarded.headers.get("X-Clerk-Trace")).toBe("client-trace");
    expect(forwarded.headers.get("X-Client-Build")).toBe("test-build");
    expect(forwarded.headers.get("Clerk-Proxy-Url")).toBe(PUBLIC_PROXY_URL);
    expect(forwarded.headers.get("Clerk-Secret-Key")).toBe("server-secret");
    expect(forwarded.headers.get("X-Forwarded-For")).toBe("203.0.113.10");
    expect(forwarded.headers.get("X-Forwarded-Host")).toBe("aidr.today");
    expect(forwarded.headers.get("X-Forwarded-Proto")).toBe("https");

    for (const header of [
      "Connection",
      "Keep-Alive",
      "Proxy-Authorization",
      "Upgrade",
      "X-Admin-Token",
      "X-Connection-Secret",
      "X-Forwarded-Host",
      "X-Forwarded-Proto",
      "X-Real-IP",
      "Forwarded",
      "Host",
    ]) {
      if (header === "X-Forwarded-Host" || header === "X-Forwarded-Proto") {
        continue;
      }
      expect(forwarded.headers.get(header)).toBeNull();
    }
  });

  it("omits forwarded client IP when Cloudflare ingress metadata is missing", async () => {
    const fetchMock = mockFetch();
    await handleClerkProxy(
      proxyRequest("/__clerk/v1/client", {
        headers: {
          "CF-Connecting-IP": "not-an-ip",
          "X-Forwarded-For": "198.51.100.1, 10.0.0.1",
        },
      }),
      makeEnv()
    );

    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get("X-Forwarded-For")).toBeNull();
    expect(forwarded.headers.get("X-Real-IP")).toBeNull();
  });

  it("uses configured preview/local metadata instead of request Host", async () => {
    const fetchMock = mockFetch();
    await handleClerkProxy(
      new Request("https://attacker.example/__clerk/v1/client"),
      makeEnv({ CLERK_PROXY_URL: "http://localhost:3014" })
    );

    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.headers.get("Clerk-Proxy-Url")).toBe(
      "http://localhost:3014/__clerk"
    );
    expect(forwarded.headers.get("X-Forwarded-Host")).toBe("localhost:3014");
    expect(forwarded.headers.get("X-Forwarded-Proto")).toBe("http");
    expect(forwarded.headers.get("Host")).toBeNull();
  });
});

describe("handleClerkProxy redirects and responses", () => {
  it.each([
    ["/v1/next?x=1", "https://aidr.today/__clerk/v1/next?x=1"],
    ["v1/next?x=1", "https://aidr.today/__clerk/v1/next?x=1"],
    [
      "https://frontend-api.clerk.dev/v1/next?x=1#fragment",
      "https://aidr.today/__clerk/v1/next?x=1#fragment",
    ],
    ["//frontend-api.clerk.dev/v1/next", "https://aidr.today/__clerk/v1/next"],
  ])("rewrites approved upstream redirect %s", async (location, expected) => {
    const fetchMock = mockFetch(redirectResponse(location));
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(expected);
    expect(await response.text()).toBe("upstream redirect");
    expect(forwarded.redirect).toBe("manual");
  });

  it.each([
    "https://evil.example/steal",
    "https://user:password@frontend-api.clerk.dev/steal",
    "http://frontend-api.clerk.dev/steal",
    "https://frontend-api.clerk.dev.evil.example/steal",
    "http://[malformed",
  ])("rejects cross-origin or malformed redirect %s", async (location) => {
    const fetchMock = mockFetch(redirectResponse(location));
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Location")).toBeNull();
    expect(await response.text()).toBe("Clerk upstream redirect rejected");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not re-add a Connection-nominated Location header", async () => {
    const upstream = new Response("redirect", {
      status: 302,
      headers: {
        Connection: "Location",
        Location: "https://evil.example/steal",
      },
    });
    mockFetch(upstream);

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Location")).toBeNull();
  });

  it("sanitizes fixed and Connection-nominated response headers", async () => {
    const upstream = new Response("ok", {
      headers: {
        Connection: "X-Upstream-Private, keep-alive",
        "Content-Length": "2",
        "Keep-Alive": "timeout=5",
        "Proxy-Authenticate": "Basic",
        "Transfer-Encoding": "chunked",
        Upgrade: "h2c",
        "X-End-To-End": "keep",
        "X-Upstream-Private": "must-not-leak",
      },
    });
    mockFetch(upstream);

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("X-End-To-End")).toBe("keep");
    for (const header of [
      "Connection",
      "Content-Length",
      "Keep-Alive",
      "Proxy-Authenticate",
      "Transfer-Encoding",
      "Upgrade",
      "X-Upstream-Private",
    ]) {
      expect(response.headers.get(header)).toBeNull();
    }
  });

  it("passes through an upstream HTTP rejection without retrying", async () => {
    const fetchMock = mockFetch(
      new Response("unauthorized", {
        status: 401,
        headers: { "X-Upstream-Reason": "auth" },
      })
    );
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Upstream-Reason")).toBe("auth");
    expect(await response.text()).toBe("unauthorized");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("handleClerkProxy upstream failures", () => {
  it("maps network errors to a generic 502 without logging or retrying POST", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new Error("secret=server-secret query=token cookie=x")
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client?token=secret", {
        method: "POST",
        body: "payload",
      }),
      makeEnv()
    );

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Clerk upstream unavailable");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("maps an upstream timeout to 504 and aborts the request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((_, reject) => {
          const signal = input instanceof Request ? input.signal : undefined;
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv({ CLERK_PROXY_TIMEOUT_MS: "10" })
    );
    await vi.advanceTimersByTimeAsync(10);
    const response = await pending;

    expect(response.status).toBe(504);
    expect(await response.text()).toBe("Clerk upstream timed out");
    expect(fetchMock).toHaveBeenCalledOnce();
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    expect(forwarded.signal.aborted).toBe(true);
  });

  it("fails closed when the public proxy URL is not configured", async () => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      { CLERK_SECRET_KEY: "server-secret" }
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
