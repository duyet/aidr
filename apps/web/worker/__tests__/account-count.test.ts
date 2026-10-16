import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AccountCountDb,
  loadClerkAccountCount,
} from "../account-count.js";
import { CLERK_USERS_COUNT_SQL } from "../clerk-users.js";

/** Minimal D1 stand-in: one COUNT statement, explicit row or failure. */
function fakeDb(options: {
  rows?: { c: number }[];
  failOn?: Error;
}): AccountCountDb & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    prepare(sql: string) {
      queries.push(sql);
      const statement = {
        bind: () => statement,
        first: async () => {
          if (options.failOn) throw options.failOn;
          return options.rows?.[0] ?? null;
        },
        all: async () => {
          if (options.failOn) throw options.failOn;
          return { results: [] };
        },
        run: async () => ({ success: true }),
      };
      return statement as unknown as ReturnType<AccountCountDb["prepare"]>;
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadClerkAccountCount", () => {
  it("counts mirrored Clerk rows with a single COUNT, never a live call", async () => {
    const db = fakeDb({ rows: [{ c: 37 }] });
    vi.spyOn(globalThis, "fetch");

    await expect(loadClerkAccountCount(db)).resolves.toEqual({
      total: 37,
      source: "d1",
      status: "available",
    });
    expect(db.queries).toEqual([CLERK_USERS_COUNT_SQL]);
    expect(CLERK_USERS_COUNT_SQL).toContain("deleted_at IS NULL");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports an empty mirror as unconfigured, never a zero", async () => {
    // An empty table cannot tell "Clerk has no accounts" from "the webhook
    // never delivered". /data is public, so a confident 0 would be
    // indistinguishable from a true count — report unknown instead.
    await expect(
      loadClerkAccountCount(fakeDb({ rows: [{ c: 0 }] }))
    ).resolves.toEqual({ total: null, source: "d1", status: "unconfigured" });
  });

  it("reports a missing D1 binding as unconfigured instead of failing", async () => {
    await expect(loadClerkAccountCount(undefined)).resolves.toEqual({
      total: null,
      source: "d1",
      status: "unconfigured",
    });
    await expect(loadClerkAccountCount(null)).resolves.toEqual({
      total: null,
      source: "d1",
      status: "unconfigured",
    });
  });

  it("surfaces a real read failure as an error state", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      loadClerkAccountCount(fakeDb({ failOn: new Error("D1 busy") }))
    ).resolves.toEqual({ total: null, source: "d1", status: "error" });
  });
});
