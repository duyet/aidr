import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildClerkProxyTarget,
  CLERK_FAPI_ORIGIN,
  CLERK_PROXY_PATH,
  CLERK_PROXY_URL,
  handleClerkProxy,
  isClerkProxyPath,
} from "../clerk-proxy.js";

function proxyRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://aidr.today${path}`, init);
}

function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
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

  it.each([
    "/__clerk//evil.example/steal",
    "/__clerk/%2f%2fevil.example/steal",
    "/__clerk/%2F%5Cevil.example/steal",
    "/__clerk/%252f%252fevil.example/steal",
    "/__clerk/\\\\evil.example/steal",
    "/__clerk//user:password@evil.example/steal",
    "/__clerk/https://user:password@evil.example/steal",
  ])("rejects authority-like suffix %s", (path) => {
    expect(() => buildClerkProxyTarget(proxyRequest(path))).toThrow(
      "Invalid Clerk proxy path"
    );
  });

  it.each(["/__clerk/%", "/__clerk/%zz", "/__clerk/%E0%A4%A"])(
    "rejects malformed suffix %s",
    (path) => {
      expect(() => buildClerkProxyTarget(proxyRequest(path))).toThrow(
        "Invalid Clerk proxy path"
      );
    }
  );
});

describe("handleClerkProxy header confinement", () => {
  it("forwards legitimate requests with server-owned headers", async () => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(
      proxyRequest("/__clerk/v1/client?foo=bar", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "203.0.113.10",
          "Clerk-Proxy-Url": "https://attacker.example",
          "Clerk-Secret-Key": "client-secret",
          Host: "attacker.example",
        },
      }),
      { CLERK_SECRET_KEY: "server-secret" }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const forwarded = fetchMock.mock.calls[0]?.[0] as Request;
    const forwardedUrl = new URL(forwarded.url);

    expect(forwardedUrl.origin).toBe(CLERK_FAPI_ORIGIN);
    expect(forwardedUrl.pathname).toBe("/v1/client");
    expect(forwardedUrl.search).toBe("?foo=bar");
    expect(forwarded.method).toBe("POST");
    expect(forwarded.headers.get("Clerk-Proxy-Url")).toBe(CLERK_PROXY_URL);
    expect(forwarded.headers.get("Clerk-Secret-Key")).toBe("server-secret");
    expect(forwarded.headers.get("X-Forwarded-For")).toBe("203.0.113.10");
    expect(forwarded.headers.get("host")).toBeNull();
  });

  it.each([
    "/__clerk//evil.example/steal",
    "/__clerk/%2f%2fevil.example/steal",
    "/__clerk/%2F%5Cevil.example/steal",
    "/__clerk/%252f%252fevil.example/steal",
    "/__clerk/\\\\evil.example/steal",
    "/__clerk//user:password@evil.example/steal",
    "/__clerk/https://user:password@evil.example/steal",
    "/__clerk/%",
  ])("does not fetch or attach the secret for %s", async (path) => {
    const fetchMock = mockFetch();
    const response = await handleClerkProxy(proxyRequest(path), {
      CLERK_SECRET_KEY: "server-secret",
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
