import { describe, expect, it } from "vitest";
import { CLERK_PROXY_PATH, isClerkProxyPath } from "../clerk-proxy.js";

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
