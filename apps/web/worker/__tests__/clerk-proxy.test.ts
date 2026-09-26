import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requireClerkProxyUrl,
  resolveClerkProxyUrl,
} from "../../src/lib/clerk-proxy-config.js";
import {
  buildClerkProxyTarget,
  CLERK_FAPI_ORIGIN,
  CLERK_PROXY_MAX_BODY_BYTES,
  CLERK_PROXY_MAX_REQUEST_BODY_BYTES,
  CLERK_PROXY_MAX_RESPONSE_BODY_BYTES,
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
  it("normalizes explicit absolute URLs and rejects relative values", () => {
    expect(resolveClerkProxyUrl("https://preview.example")).toBe(
      "https://preview.example/__clerk"
    );
    expect(resolveClerkProxyUrl("http://localhost:3014/__clerk/")).toBe(
      "http://localhost:3014/__clerk"
    );
    expect(resolveClerkProxyUrl("/__clerk")).toBeUndefined();
  });

  it("requires one explicit trusted absolute value", () => {
    expect(requireClerkProxyUrl("https://preview.example/__clerk")).toBe(
      "https://preview.example/__clerk"
    );
    expect(() =>
      requireClerkProxyUrl("https://other.example/__clerk")
    ).not.toThrow();
    expect(() =>
      requireClerkProxyUrl("http://preview.example/__clerk")
    ).toThrow("explicit trusted absolute URL");
    expect(() => requireClerkProxyUrl(undefined)).toThrow(
      "explicit trusted absolute URL"
    );
  });

  it("allows HTTP only for explicit loopback development", () => {
    expect(resolveClerkProxyUrl("http://127.0.0.2:3014")).toBe(
      "http://127.0.0.2:3014/__clerk"
    );
    expect(resolveClerkProxyUrl("http://[::1]:3014")).toBe(
      "http://[::1]:3014/__clerk"
    );
    expect(resolveClerkProxyUrl("http://preview.example")).toBeUndefined();
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
      "Content-Length",
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
      new Request("http://localhost:3014/__clerk/v1/client", {
        headers: { Host: "attacker.example" },
      }),
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

  it("fails closed when the request origin differs from trusted config", async () => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(
      new Request("https://attacker.example/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
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

  it.each([200, 201, 202, 401, 500, 503, 204, 304])(
    "rewrites an approved Location on status %i",
    async (status) => {
      const upstream = new Response(
        status === 204 || status === 304 ? null : "body",
        {
          status,
          headers: { Location: "/v1/next?from=status" },
        }
      );
      mockFetch(upstream);

      const response = await handleClerkProxy(
        proxyRequest("/__clerk/v1/client"),
        makeEnv()
      );

      expect(response.status).toBe(status);
      expect(response.headers.get("Location")).toBe(
        "https://aidr.today/__clerk/v1/next?from=status"
      );
    }
  );

  it.each([200, 201, 202, 401, 500, 503])(
    "rejects an external Location on status %i",
    async (status) => {
      const upstream = new Response("body", {
        status,
        headers: { Location: "https://evil.example/steal" },
      });
      const fetchMock = mockFetch(upstream);

      const response = await handleClerkProxy(
        proxyRequest("/__clerk/v1/client"),
        makeEnv()
      );

      expect(response.status).toBe(502);
      expect(response.headers.get("Location")).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("allows a handshake redirect back to the application origin", async () => {
    // Clerk's /v1/client/handshake answers with a 3xx whose Location is the
    // `redirect_url`, i.e. the app origin. Rejecting it broke every session
    // refresh with a 502. The app origin is first-party and already where the
    // browser is, so it passes through unchanged.
    const fetchMock = mockFetch(
      redirectResponse("https://aidr.today/", 307)
    );

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client/handshake"),
      makeEnv()
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("https://aidr.today/");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the app-origin allowance from becoming an open redirect", async () => {
    // Same host, different scheme/port/credentials, or an attacker suffix must
    // all still be rejected: only the exact publicProxy.origin passes.
    for (const location of [
      "http://aidr.today/", // scheme downgrade
      "https://aidr.today:8443/", // port swap
      "https://user:password@aidr.today/", // credentialed
      "https://aidr.today.evil.example/", // suffix attack
      "https://evil.example/", // unrelated origin
    ]) {
      mockFetch(redirectResponse(location));
      const response = await handleClerkProxy(
        proxyRequest("/__clerk/v1/client/handshake"),
        makeEnv()
      );
      expect(response.status, location).toBe(502);
      expect(response.headers.get("Location"), location).toBeNull();
    }
  });

  it("rejects a malformed Location on a non-redirect response", async () => {
    mockFetch(
      new Response("body", {
        status: 200,
        headers: { Location: "http://[malformed" },
      })
    );

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("Location")).toBeNull();
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

describe("handleClerkProxy encoding and body limits", () => {
  it("forces identity encoding and rejects encoded request bodies", async () => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client", {
        method: "POST",
        body: "payload",
        headers: {
          "Accept-Encoding": "gzip, br",
          "Content-Encoding": "gzip",
        },
      }),
      makeEnv()
    );

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forces identity encoding and strips decoded response encoding", async () => {
    const fetchMock = mockFetch(
      new Response("decoded body", {
        headers: {
          "Accept-Encoding": "gzip",
          "Content-Encoding": "gzip",
        },
      })
    );
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client", {
        headers: { "Accept-Encoding": "gzip" },
      }),
      makeEnv()
    );
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;

    expect(forwarded.headers.get("Accept-Encoding")).toBe("identity");
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(await response.text()).toBe("decoded body");
  });

  it("rejects a declared request body over the explicit limit with 413", async () => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client", {
        method: "POST",
        body: "small",
        headers: {
          "Content-Length": String(CLERK_PROXY_MAX_REQUEST_BODY_BYTES + 1),
        },
      }),
      makeEnv()
    );

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a request body exactly at the 1 MiB limit", async () => {
    const payload = new Uint8Array(CLERK_PROXY_MAX_BODY_BYTES);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const forwarded = input as Request;
      expect((await forwarded.arrayBuffer()).byteLength).toBe(
        CLERK_PROXY_MAX_BODY_BYTES
      );
      return new Response("ok");
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://aidr.today/__clerk/v1/client", {
      method: "POST",
      body: payload,
    });

    const response = await handleClerkProxy(request, makeEnv());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("pre-reads a POST body even when upstream returns without consuming it", async () => {
    const fetchMock = mockFetch(new Response("early upstream response"));
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client", {
        method: "POST",
        body: "payload",
      }),
      makeEnv()
    );
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;

    expect(response.status).toBe(200);
    expect(await forwarded.text()).toBe("payload");
  });

  it("rejects a streamed request body before an early upstream response", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(CLERK_PROXY_MAX_BODY_BYTES + 1));
        controller.close();
      },
    });
    const request = new Request("https://aidr.today/__clerk/v1/client", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const fetchMock = mockFetch(new Response("early upstream response"));

    const response = await handleClerkProxy(request, makeEnv());

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams a response exactly at the 1 MiB limit", async () => {
    const payload = new Uint8Array(CLERK_PROXY_MAX_RESPONSE_BODY_BYTES);
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    mockFetch(new Response(upstreamBody));

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(
      CLERK_PROXY_MAX_RESPONSE_BODY_BYTES
    );
  });

  it("rejects a declared response over the 1 MiB limit", async () => {
    const cancel = vi.fn();
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("small"));
      },
      cancel,
    });
    mockFetch(
      new Response(upstreamBody, {
        headers: {
          "Content-Length": String(CLERK_PROXY_MAX_RESPONSE_BODY_BYTES + 1),
        },
      })
    );

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalled();
  });

  it("cancels an undeclared response stream after the 1 MiB limit", async () => {
    const cancel = vi.fn();
    let pullCount = 0;
    const upstreamBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pullCount === 0) {
          pullCount += 1;
          controller.enqueue(
            new Uint8Array(CLERK_PROXY_MAX_RESPONSE_BODY_BYTES)
          );
        } else if (pullCount === 1) {
          pullCount += 1;
          controller.enqueue(new Uint8Array(1));
        }
      },
      cancel,
    });
    mockFetch(new Response(upstreamBody));

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});

describe("handleClerkProxy upstream failures", () => {
  it("maps a stalled response body to 504", async () => {
    vi.useFakeTimers();
    const stalledBody = new ReadableStream<Uint8Array>({
      start() {
        // No first byte: the handler can still return a controlled 504.
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(stalledBody, { status: 200 }));
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
  });

  it("cancels a response stream when its deadline expires after headers", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
      },
      cancel,
    });
    mockFetch(new Response(stalledBody, { status: 200 }));

    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client"),
      makeEnv({ CLERK_PROXY_TIMEOUT_MS: "10" })
    );
    expect(response.status).toBe(200);

    const body = response.arrayBuffer();
    const bodyAssertion = expect(body).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10);
    await bodyAssertion;
    expect(cancel).toHaveBeenCalled();
  });

  it("propagates the incoming request signal to the upstream request", async () => {
    const requestController = new AbortController();
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    let forwarded: Request | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      forwarded = input as Request;
      resolveStarted();
      return new Promise<Response>((_, reject) => {
        forwarded?.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://aidr.today/__clerk/v1/client", {
      signal: requestController.signal,
    });

    const pending = handleClerkProxy(request, makeEnv());
    await started;
    requestController.abort();
    const response = await pending;

    expect(response.status).toBe(499);
    expect(forwarded?.signal.aborted).toBe(true);
  });

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
