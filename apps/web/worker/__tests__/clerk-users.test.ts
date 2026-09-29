import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillClerkUsers,
  CLERK_USER_DELETE_SQL,
  CLERK_USER_UPSERT_SQL,
  CLERK_USERS_COUNT_SQL,
  clerkUserEmail,
  countClerkUsers,
  hasClerkUsersTable,
  parseClerkUserList,
  parseClerkUserTotal,
  resetClerkUsersTableProbe,
  softDeleteClerkUser,
  upsertClerkUser,
  upsertClerkUsers,
} from "../clerk-users.js";

const migration = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0026_clerk_users.sql"
  ),
  "utf8"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

interface ClerkRow {
  id: string;
  email: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toSqliteInput(value: unknown): SqliteInput {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    ArrayBuffer.isView(value)
  ) {
    return value as SqliteInput;
  }
  throw new TypeError("Unsupported SQLite bind value");
}

/** Real SQL: the webhook/backfill statements are exercised against SQLite. */
class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next.map(toSqliteInput);
        return prepared;
      },
      all: async () => ({ results: statement.all(...args) as unknown[] }),
      first: async () => statement.get(...args) ?? null,
      run: async () => {
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
    return prepared;
  }

  async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement.run());
    return results as Array<{ meta: { changes: number } }>;
  }
}

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  return { db: new SqliteD1(sqlite), close: () => sqlite.close() };
}

function row() {
  const { db, close } = makeDb();
  return {
    db: db as unknown as D1Database,
    /** Synchronous read of what the D1 statements actually wrote. */
    read(): ClerkRow[] {
      return db.db
        .prepare(
          "SELECT id, email, created_at, updated_at, deleted_at FROM clerk_users ORDER BY id"
        )
        .all() as unknown as ClerkRow[];
    },
    close,
  };
}

const user = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  email_addresses: [{ id: "e1", email_address: "duyet@example.com" }],
  primary_email_address_id: "e1",
  created_at: 1_700_000_000_000,
  ...over,
});

beforeEach(() => {
  resetClerkUsersTableProbe();
});

describe("clerk_users mirror", () => {
  it("counts live accounts and leaves soft-deleted rows out of the total", async () => {
    const store = row();
    try {
      await upsertClerkUsers(store.db, [
        { id: "user_a", email: "a@example.com", createdAt: 10, updatedAt: 10 },
        { id: "user_b", email: "b@example.com", createdAt: 20, updatedAt: 20 },
      ]);
      await softDeleteClerkUser(store.db, "user_b", 30);

      expect(await countClerkUsers(store.db)).toBe(1);
      // The row is kept for audit, not deleted.
      expect(store.read()).toEqual([
        {
          id: "user_a",
          email: "a@example.com",
          created_at: 10,
          updated_at: 10,
          deleted_at: null,
        },
        {
          id: "user_b",
          email: "b@example.com",
          created_at: 20,
          updated_at: 30,
          deleted_at: 30,
        },
      ]);
      expect(CLERK_USERS_COUNT_SQL).toContain("WHERE deleted_at IS NULL");
    } finally {
      store.close();
    }
  });

  it("is replay-safe: a redelivered create upserts one row, not two", async () => {
    const store = row();
    try {
      await upsertClerkUser(store.db, {
        id: "user_a",
        email: "old@example.com",
        createdAt: 10,
        updatedAt: 10,
      });
      await upsertClerkUser(store.db, {
        id: "user_a",
        email: "new@example.com",
        createdAt: 999,
        updatedAt: 40,
      });

      expect(store.read()).toEqual([
        {
          id: "user_a",
          email: "new@example.com",
          // A later event must never rewrite when the account was created.
          created_at: 10,
          updated_at: 40,
          deleted_at: null,
        },
      ]);
      expect(CLERK_USER_UPSERT_SQL).toContain("ON CONFLICT(id) DO UPDATE SET");
      expect(CLERK_USER_DELETE_SQL).toContain("SET deleted_at = ?");
    } finally {
      store.close();
    }
  });

  it("restores an account that Clerk reports as updated after a delete", async () => {
    const store = row();
    try {
      await upsertClerkUser(store.db, {
        id: "user_a",
        email: "a@example.com",
        createdAt: 10,
        updatedAt: 10,
      });
      await softDeleteClerkUser(store.db, "user_a", 20);
      expect(await countClerkUsers(store.db)).toBe(0);

      await upsertClerkUser(store.db, {
        id: "user_a",
        email: "a@example.com",
        createdAt: 10,
        updatedAt: 30,
      });
      expect(await countClerkUsers(store.db)).toBe(1);
      expect(store.read()[0].deleted_at).toBeNull();
    } finally {
      store.close();
    }
  });

  it("treats an unmigrated database as unconfigured, never as zero", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = new SqliteD1(sqlite) as unknown as D1Database;
      expect(await hasClerkUsersTable(db)).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  it("batches a page in one round-trip and skips an empty page", async () => {
    const store = row();
    try {
      await upsertClerkUsers(store.db, []);
      expect(store.read()).toEqual([]);
    } finally {
      store.close();
    }
  });
});

describe("parseClerkUserList", () => {
  it("keeps only real Clerk user ids and prefers the primary email", () => {
    const rows = parseClerkUserList(
      {
        data: [
          user("user_a", {
            email_addresses: [
              { id: "other", email_address: "spam@example.com" },
              { id: "primary", email_address: "duyet@example.com" },
            ],
            primary_email_address_id: "primary",
          }),
          user("not-a-clerk-id"),
          { id: "user_b" },
          null,
        ],
      },
      500
    );

    expect(rows).toEqual([
      {
        id: "user_a",
        email: "duyet@example.com",
        // Clerk timestamps are milliseconds; D1 stores epoch seconds.
        createdAt: 1_700_000_000,
        updatedAt: 500,
      },
      { id: "user_b", email: null, createdAt: 500, updatedAt: 500 },
    ]);
  });

  it("falls back to first-seen time instead of guessing a creation date", () => {
    const [parsed] = parseClerkUserList({ data: [{ id: "user_a" }] }, 4242);
    expect(parsed?.createdAt).toBe(4242);
    expect(parsed?.updatedAt).toBe(4242);
  });

  it("returns nothing for a payload without a user list", () => {
    expect(parseClerkUserList(null, 1)).toEqual([]);
    expect(parseClerkUserList({ data: "nope" }, 1)).toEqual([]);
  });
});

describe("clerkUserEmail", () => {
  it("rejects malformed or oversized addresses instead of storing them", () => {
    expect(clerkUserEmail({ email_addresses: [] })).toBeNull();
    expect(
      clerkUserEmail({ email_addresses: [{ email_address: "not-an-email" }] })
    ).toBeNull();
    expect(
      clerkUserEmail({
        email_addresses: [{ email_address: `${"a".repeat(400)}@example.com` }],
      })
    ).toBeNull();
    expect(
      clerkUserEmail({ email_addresses: [{ email_address: " duyet@x.io " }] })
    ).toBe("duyet@x.io");
  });
});

describe("parseClerkUserTotal", () => {
  it("accepts Clerk's aggregate total but never infers from the page length", () => {
    expect(
      parseClerkUserTotal({ data: [{ id: "user_1" }], total_count: 37 })
    ).toBe(37);
    expect(parseClerkUserTotal({ data: [{ id: "user_1" }] })).toBeNull();
    expect(parseClerkUserTotal({ total_count: -1 })).toBeNull();
    expect(parseClerkUserTotal({ total_count: 1.5 })).toBeNull();
    expect(parseClerkUserTotal(null)).toBeNull();
  });
});

describe("backfillClerkUsers", () => {
  it("reports unconfigured instead of calling Clerk without a secret", async () => {
    const fetcher = vi.fn();
    await expect(
      backfillClerkUsers({ DB: {} as D1Database }, fetcher)
    ).resolves.toEqual({
      status: "unconfigured",
      synced: 0,
      pages: 0,
      total: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pages the Backend API into D1 and reports Clerk's own total", async () => {
    const store = row();
    // A full first page is what makes the backfill ask for the next offset; a
    // short page ends the walk.
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      user(`user_${index}`)
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: firstPage, total_count: 101 }), {
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [user("user_last")], total_count: 101 }),
          { headers: { "Content-Type": "application/json" } }
        )
      );

    try {
      const result = await backfillClerkUsers(
        { DB: store.db, CLERK_SECRET_KEY: "sk_test" },
        fetcher
      );

      expect(result).toEqual({
        status: "ok",
        synced: 101,
        pages: 2,
        total: 101,
      });
      expect(await countClerkUsers(store.db)).toBe(101);
      const [firstCall] = fetcher.mock.calls[0];
      expect(String(firstCall)).toContain("https://api.clerk.com/v1/users?");
      expect(String(firstCall)).toContain("limit=100");
      expect(String(firstCall)).toContain("offset=0");
      expect(String(fetcher.mock.calls[1][0])).toContain("offset=100");
      // A short page ends the walk instead of asking Clerk for an empty page.
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher.mock.calls[0][1]).toMatchObject({
        headers: { Authorization: "Bearer sk_test" },
      });
    } finally {
      store.close();
    }
  });

  it("surfaces an upstream failure without claiming a synced total", async () => {
    const store = row();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 502 }));
    try {
      await expect(
        backfillClerkUsers(
          { DB: store.db, CLERK_SECRET_KEY: "sk_test" },
          fetcher
        )
      ).resolves.toEqual({
        status: "error",
        synced: 0,
        pages: 0,
        total: null,
        error: "clerk responded 502",
      });
    } finally {
      store.close();
    }
  });

  it("requires a D1 binding", async () => {
    await expect(
      backfillClerkUsers({ CLERK_SECRET_KEY: "sk_test" }, vi.fn())
    ).resolves.toMatchObject({
      status: "error",
      error: "D1 binding DB not configured",
    });
  });
});
