import { describe, expect, it } from "vitest";
import { deriveUnsubscribeToken } from "../subscribe/handlers.js";
import type { Env } from "../types.js";

describe("deriveUnsubscribeToken", () => {
  it("issues a fresh HMAC token per signup when the secret is configured", async () => {
    // A token that repeats for an address would let a link from an earlier,
    // unsubscribed signup remove a later one (#723).
    const env = { NEWS_UNSUBSCRIBE_SECRET: "test-secret" } as Env;
    const a = await deriveUnsubscribeToken(env, "user@example.com");
    const b = await deriveUnsubscribeToken(env, "user@example.com");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falls back to UUID when secret is unset", async () => {
    const env = {} as Env;
    const a = await deriveUnsubscribeToken(env, "a@b.com");
    const b = await deriveUnsubscribeToken(env, "a@b.com");
    expect(a).not.toBe(b);
  });
});
