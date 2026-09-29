import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AccountCountDb,
  loadClerkAccountCount,
} from "../account-count.js";
import {
  CLERK_USERS_COUNT_SQL,
  CLERK_USERS_PROBE_SQL,
  resetClerkUsersTableProbe,
} from "../clerk-users.js";

/** Minimal D1 stand-in: one COUNT statement, explicit row or failure. */
function fakeDb(options: {
  rows?: { c: number }[];
  failOn?: Error;
  failCountWith?: Error;
}): AccountCountDb & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    prepare(sql: string) {
      queries.push(sql);
      const isCount = sql === CLERK_USERS_COUNT_SQL;
      const statement = {
        bind: () => statement,
        first: async () => {
          if (options.failOn) throw options.failOn;
          if (isCount && options.failCountWith) throw options.failCountWith;
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
  resetClerkUsersTableProbe();
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
    expect(db.queries).toEqual([CLERK_USERS_PROBE_SQL, CLERK_USERS_COUNT_SQL]);
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

  it("never turns an unmigrated database into a zero total", async () => {
    const missingTable = new Error(
      "D1_ERROR: no such table: clerk_users: SQLITE_ERROR"
    );
    await expect(
      loadClerkAccountCount(fakeDb({ failOn: missingTable }))
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

  it("reports an error when only the COUNT fails on a migrated database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb({
      rows: [{ c: 0 }],
      failCountWith: new Error("D1 busy"),
    });

    // The schema probe succeeded, so a failing COUNT is a read error, not an
    // unconfigured database and never a zero.
    await expect(loadClerkAccountCount(db)).resolves.toEqual({
      total: null,
      source: "d1",
      status: "error",
    });
  });

  it("does not cache a transient failure as a missing schema", async () => {
    const first = fakeDb({ failOn: new Error("D1 busy") });
    const second = fakeDb({ rows: [{ c: 4 }] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(loadClerkAccountCount(first)).resolves.toMatchObject({
      status: "error",
    });
    // The schema probe must retry instead of pinning "unsupported" forever.
    await expect(loadClerkAccountCount(second)).resolves.toEqual({
      total: 4,
      source: "d1",
      status: "available",
    });
  });
});
