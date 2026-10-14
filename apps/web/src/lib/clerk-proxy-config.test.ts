import { describe, expect, it } from "vitest";
import { clerkProxyUrlForMode } from "./clerk-proxy-config";

const CANONICAL = "https://aidr.today/__clerk";

describe("clerkProxyUrlForMode", () => {
  it("builds with wrangler.toml's URL when nothing overrides it", () => {
    expect(clerkProxyUrlForMode("production", undefined, CANONICAL)).toBe(
      CANONICAL
    );
  });

  it("refuses a build whose proxy differs from wrangler.toml", () => {
    for (const configured of [
      "https://staging.aidr.today/__clerk",
      "http://localhost:3014/__clerk",
    ]) {
      expect(() =>
        clerkProxyUrlForMode("production", configured, CANONICAL)
      ).toThrow("must match wrangler.toml");
    }
  });

  // The production proxy forwards with the live secret, so a dev-instance
  // handshake sent there bounces off aidr.today with a 422 (#630).
  it("never sends local dev to the production proxy", () => {
    expect(
      clerkProxyUrlForMode("development", undefined, CANONICAL)
    ).toBeUndefined();
    expect(
      clerkProxyUrlForMode("development", CANONICAL, CANONICAL)
    ).toBeUndefined();
  });

  it("keeps an explicit loopback proxy in development", () => {
    expect(
      clerkProxyUrlForMode(
        "development",
        "http://localhost:3014/__clerk",
        CANONICAL
      )
    ).toBe("http://localhost:3014/__clerk");
  });

  it("rejects an untrusted proxy URL in development", () => {
    expect(() =>
      clerkProxyUrlForMode(
        "development",
        "http://example.com/__clerk",
        CANONICAL
      )
    ).toThrow("explicit trusted absolute URL");
  });
});
