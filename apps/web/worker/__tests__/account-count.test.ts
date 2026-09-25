import { describe, expect, it, vi } from "vitest";
import {
  type AccountCountFetch,
  loadClerkAccountCount,
  parseClerkUserTotal,
} from "../account-count.js";

describe("parseClerkUserTotal", () => {
  it("accepts Clerk's aggregate total but never infers from the page length", () => {
    expect(
      parseClerkUserTotal({ data: [{ id: "user_1" }], total_count: 37 })
    ).toBe(37);
    expect(parseClerkUserTotal({ data: [{ id: "user_1" }] })).toBeNull();
    expect(
      parseClerkUserTotal({ data: [{ id: "user_1" }], total_count: -1 })
    ).toBeNull();
  });

  it("rejects non-integer and malformed values", () => {
    expect(parseClerkUserTotal({ total_count: 1.5 })).toBeNull();
    expect(parseClerkUserTotal({ total_count: "not-a-count" })).toBeNull();
    expect(parseClerkUserTotal(null)).toBeNull();
  });
});

describe("loadClerkAccountCount", () => {
  it("does not call the upstream when the account source is not configured", async () => {
    const fetcher = vi.fn<AccountCountFetch>();

    await expect(loadClerkAccountCount({}, fetcher)).resolves.toEqual({
      total: null,
      source: "clerk",
      status: "unconfigured",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns the aggregate total without exposing the response body", async () => {
    const fetcher = vi.fn<AccountCountFetch>(async (_input, init) => {
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        Authorization: "Bearer server-only-secret",
      });
      return new Response(
        JSON.stringify({ data: [{ id: "user_1" }], total_count: 37 })
      );
    });

    await expect(
      loadClerkAccountCount({ CLERK_SECRET_KEY: "server-only-secret" }, fetcher)
    ).resolves.toEqual({ total: 37, source: "clerk", status: "available" });
  });

  it("reports upstream errors instead of turning them into zero users", async () => {
    const failed = vi.fn<AccountCountFetch>(async () => {
      throw new Error("upstream unavailable");
    });
    const badResponse = vi.fn<AccountCountFetch>(
      async () => new Response("not json", { status: 200 })
    );

    await expect(
      loadClerkAccountCount({ CLERK_SECRET_KEY: "secret" }, failed)
    ).resolves.toEqual({ total: null, source: "clerk", status: "error" });
    await expect(
      loadClerkAccountCount({ CLERK_SECRET_KEY: "secret" }, badResponse)
    ).resolves.toEqual({ total: null, source: "clerk", status: "error" });
  });
});
