import { describe, expect, it } from "vitest";
import { hasClerkSessionCookie, routeNeedsClerk } from "./clerk-user";

describe("hasClerkSessionCookie", () => {
  it("is false with no cookies, so plain readers never trigger the SDK load", () => {
    expect(hasClerkSessionCookie("")).toBe(false);
    expect(hasClerkSessionCookie("news_lang=vi; _ga=GA1.1")).toBe(false);
  });

  it("is true for a __client_uat timestamp, so a signed-in reader gets the UserButton", () => {
    expect(hasClerkSessionCookie("news_lang=vi; __client_uat=1757000000")).toBe(
      true
    );
    expect(hasClerkSessionCookie("__client_uat_abc123=1757000000")).toBe(true);
  });

  it("ignores __client_uat=0, which Clerk sets for every signed-out visitor", () => {
    expect(hasClerkSessionCookie("__client_uat=0")).toBe(false);
    expect(hasClerkSessionCookie("__client_uat=")).toBe(false);
  });

  it("is true for __session and __clerk cookies, matching the server cache bypass", () => {
    expect(hasClerkSessionCookie("__session=abc")).toBe(true);
    expect(hasClerkSessionCookie("__clerk_db_jwt=abc")).toBe(true);
  });
});

describe("routeNeedsClerk", () => {
  it("is false on reader pages, so the homepage and stories stay SDK-free", () => {
    expect(routeNeedsClerk("/")).toBe(false);
    expect(routeNeedsClerk("/story/abc")).toBe(false);
    expect(routeNeedsClerk("/submit")).toBe(false);
    expect(routeNeedsClerk("/sign-inbox")).toBe(false);
  });

  it("is true on auth, contribute and admin routes, which render Clerk UI without a session", () => {
    for (const path of [
      "/sign-in",
      "/sign-in/factor-one",
      "/sign-up",
      "/contribute",
      "/contribute/new",
      "/mail",
      "/data",
    ]) {
      expect(routeNeedsClerk(path), path).toBe(true);
    }
  });
});
