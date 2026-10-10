import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLERK_USER_DELETE_SQL,
  CLERK_USER_UPSERT_SQL,
} from "../clerk-users.js";
import {
  CLERK_USER_ID_PATTERN,
  CLERK_WEBHOOK_MAX_BODY_BYTES,
  CLERK_WEBHOOK_PATH,
  CLERK_WEBHOOK_TOLERANCE_SECONDS,
  clerkEventType,
  decodeClerkWebhookSecret,
  handleClerkWebhook,
  parseClerkUserEvent,
  svixSignatureHeader,
  svixSignedContent,
  verifyClerkWebhookSignature,
} from "../clerk-webhook.js";

/**
 * A `whsec_`-prefixed signing secret assembled at runtime from obvious filler
 * material. The prefix is joined from parts and the key bytes are derived from
 * `repeat()`, so no source line ever holds a contiguous `whsec_` + base64
 * blob — that shape is what secret scanners (GitGuardian among them) read as a
 * live Clerk/Svix signing secret, and a fixture must never be one.
 */
function fixtureSecret(material: string): string {
  return ["wh", "sec", "_"].join("") + Buffer.from(material).toString("base64");
}

/** 32-byte key, as Clerk's Dashboard → Webhooks → Signing Secret. */
const SECRET = fixtureSecret("0".repeat(32));
/** Same shape, but under the 16-byte minimum the decoder rejects. */
const TOO_SHORT_SECRET = fixtureSecret("too-short");
const NOW_SEC = 1_800_000_000;
const NOW_MS = NOW_SEC * 1000;

interface Recorded {
  sql: string;
  args: unknown[];
}

/** D1 stand-in that records writes so a rejection can be proven inert. */
function fakeDb(options: { failOn?: Error } = {}) {
  const statements: Recorded[] = [];
  const db = {
    statements,
    prepare(sql: string) {
      const record: Recorded = { sql, args: [] };
      const statement = {
        bind: (...args: unknown[]) => {
          record.args = args;
          return statement;
        },
        run: async () => {
          if (options.failOn) throw options.failOn;
          statements.push(record);
          return { success: true };
        },
        first: async () => null,
        all: async () => ({ results: [] }),
      };
      return statement;
    },
  };
  return { db: db as unknown as D1Database, statements };
}

function userEvent(type: string, over: Record<string, unknown> = {}) {
  return {
    data: {
      id: "user_2abc",
      email_addresses: [{ id: "e1", email_address: "duyet@example.com" }],
      primary_email_address_id: "e1",
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_500_000,
      ...over,
    },
    object: "user",
    type,
  };
}

function verifiedUser(type: string, email: string) {
  return userEvent(type, {
    email_addresses: [
      {
        id: "e1",
        email_address: email,
        verification: { status: "verified" },
      },
    ],
    primary_email_address_id: "e1",
  });
}

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

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

/** Executes the webhook's D1 statements. The recording fake does not. */
class SqliteMirror {
  constructor(readonly db: DatabaseSync) {}

  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next.map(toSqliteInput);
        return prepared;
      },
      run: async () => {
        statement.run(...args);
        return { success: true };
      },
      first: async () => statement.get(...args) ?? null,
      all: async () => ({ results: statement.all(...args) }),
    };
    return prepared;
  }
}

async function signedRequest(
  body: string,
  options: {
    secret?: string;
    type?: string;
    id?: string;
    timestamp?: string;
    headers?: Record<string, string>;
    tamperSignature?: boolean;
  } = {}
) {
  const id = options.id ?? "msg_2abc";
  const timestamp = options.timestamp ?? String(NOW_SEC);
  const signature = await svixSignatureHeader(
    options.secret ?? SECRET,
    id,
    timestamp,
    body
  );
  const headers = new Headers({
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": options.tamperSignature
      ? `v1,${Buffer.from("wrong-signature").toString("base64")}`
      : signature,
    ...(options.type ? { "svix-type": options.type } : {}),
    ...options.headers,
  });
  return new Request(`https://aidr.today${CLERK_WEBHOOK_PATH}`, {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  // The handler verifies against Date.now(); pin the clock so a fixed
  // delivery timestamp is inside the replay tolerance.
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("decodeClerkWebhookSecret", () => {
  it("accepts a whsec_ key and rejects anything else", () => {
    expect(decodeClerkWebhookSecret(SECRET)?.byteLength).toBe(32);
    expect(decodeClerkWebhookSecret("sk_test_not_a_webhook_secret")).toBeNull();
    expect(decodeClerkWebhookSecret(TOO_SHORT_SECRET)).toBeNull();
    expect(decodeClerkWebhookSecret("")).toBeNull();
  });
});

describe("verifyClerkWebhookSignature", () => {
  it("accepts a correct Svix signature over id.timestamp.body", async () => {
    const body = JSON.stringify(userEvent("user.created"));
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(NOW_SEC),
      "svix-signature": await svixSignatureHeader(
        SECRET,
        "msg_1",
        String(NOW_SEC),
        body
      ),
    });

    await expect(
      verifyClerkWebhookSignature({
        headers,
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toEqual({
      verified: true,
      reason: "verified",
      id: "msg_1",
      timestamp: NOW_SEC,
    });
    expect(svixSignedContent("msg_1", String(NOW_SEC), body)).toBe(
      `msg_1.${NOW_SEC}.${body}`
    );
  });

  it("rejects a signature that does not match the body", async () => {
    const body = JSON.stringify(userEvent("user.created"));
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(NOW_SEC),
      "svix-signature": await svixSignatureHeader(
        SECRET,
        "msg_1",
        String(NOW_SEC),
        JSON.stringify(userEvent("user.deleted"))
      ),
    });

    await expect(
      verifyClerkWebhookSignature({
        headers,
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({ verified: false, reason: "signature_mismatch" });
  });

  it("rejects a replayed delivery outside the tolerance window", async () => {
    const body = "{}";
    const stale = String(NOW_SEC - CLERK_WEBHOOK_TOLERANCE_SECONDS - 60);
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": stale,
      "svix-signature": await svixSignatureHeader(SECRET, "msg_1", stale, body),
    });

    await expect(
      verifyClerkWebhookSignature({
        headers,
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({ verified: false, reason: "stale_timestamp" });
  });

  it("rejects missing headers, a malformed secret, and a bad timestamp", async () => {
    const body = "{}";
    const signature = await svixSignatureHeader(
      SECRET,
      "msg_1",
      String(NOW_SEC),
      body
    );

    await expect(
      verifyClerkWebhookSignature({
        headers: new Headers(),
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({ reason: "missing_headers" });
    await expect(
      verifyClerkWebhookSignature({
        headers: new Headers({
          "svix-id": "msg_1",
          "svix-timestamp": String(NOW_SEC),
          "svix-signature": signature,
        }),
        body,
        secret: "not-a-webhook-secret",
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({ reason: "malformed_secret" });
    await expect(
      verifyClerkWebhookSignature({
        headers: new Headers({
          "svix-id": "msg_1",
          "svix-timestamp": "not-a-timestamp",
          "svix-signature": signature,
        }),
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({ reason: "malformed_timestamp" });
  });

  it("verifies a v1,<base64> signature whose padding ends with =", async () => {
    const body = "{}";
    const id = "msg_pad";
    const timestamp = String(NOW_SEC);
    const header = await svixSignatureHeader(SECRET, id, timestamp, body);
    // Svix joins the version and the signature with a comma. HMAC-SHA256
    // base64 carries a trailing `=`, which a split on `=` would drop.
    expect(header).toMatch(/^v1,[A-Za-z0-9+/]+={1,2}$/);

    await expect(
      verifyClerkWebhookSignature({
        headers: new Headers({
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": header,
        }),
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({
      verified: true,
      reason: "verified",
      timestamp: NOW_SEC,
    });
  });

  it("accepts any matching v1 entry in a rotated signature list", async () => {
    const body = "{}";
    const good = await svixSignatureHeader(
      SECRET,
      "msg_1",
      String(NOW_SEC),
      body
    );
    const headers = new Headers({
      "svix-id": "msg_1",
      "svix-timestamp": String(NOW_SEC),
      "svix-signature": `v1,${Buffer.from("stale-rotation").toString("base64")} ${good}`,
    });

    await expect(
      verifyClerkWebhookSignature({
        headers,
        body,
        secret: SECRET,
        nowMs: NOW_MS,
      })
    ).resolves.toMatchObject({ verified: true });
  });
});

describe("parseClerkUserEvent", () => {
  it("maps the three user lifecycle events", () => {
    const created = parseClerkUserEvent(
      userEvent("user.created"),
      "user.created",
      500
    );
    expect(created).toMatchObject({
      ok: true,
      result: {
        action: "handled",
        event: {
          type: "user.created",
          id: "user_2abc",
          receivedAt: 500,
          row: {
            id: "user_2abc",
            email: "duyet@example.com",
            // Clerk's ms timestamp normalized to seconds.
            createdAt: 1_700_000_000,
            updatedAt: 500,
          },
        },
      },
    });

    const deleted = parseClerkUserEvent(
      { data: { id: "user_2abc" } },
      "user.deleted",
      600
    );
    expect(deleted).toMatchObject({
      ok: true,
      result: { action: "handled", event: { type: "user.deleted", row: null } },
    });
  });

  it("ignores non-user events and rejects unusable payloads", () => {
    expect(
      parseClerkUserEvent({ data: { id: "user_1" } }, "session.created", 1)
    ).toEqual({
      ok: true,
      result: { action: "ignored", type: "session.created" },
    });
    expect(parseClerkUserEvent({}, null, 1)).toEqual({
      ok: false,
      error: "missing event type",
    });
    expect(parseClerkUserEvent("nope", "user.created", 1)).toEqual({
      ok: false,
      error: "invalid payload",
    });
    expect(parseClerkUserEvent({}, "user.created", 1)).toEqual({
      ok: false,
      error: "missing event data",
    });
    expect(
      parseClerkUserEvent(
        { data: { id: "../../etc/passwd" } },
        "user.created",
        1
      )
    ).toEqual({ ok: false, error: "invalid user id" });
    expect(CLERK_USER_ID_PATTERN.test("user_2abc")).toBe(true);
    expect(CLERK_USER_ID_PATTERN.test("user_")).toBe(false);
  });

  it("reads the event type from the Svix header, then the body", () => {
    expect(
      clerkEventType(new Headers({ "svix-type": "user.updated" }), {})
    ).toBe("user.updated");
    expect(clerkEventType(new Headers(), { type: "user.deleted" })).toBe(
      "user.deleted"
    );
    expect(clerkEventType(new Headers(), {})).toBeNull();
  });

  it("refuses an unsigned svix-type header that contradicts the signed body type", () => {
    expect(
      clerkEventType(new Headers({ "svix-type": "user.deleted" }), {
        type: "user.created",
      })
    ).toBeNull();
    expect(
      clerkEventType(new Headers({ "svix-type": "user.created" }), {
        type: "user.created",
      })
    ).toBe("user.created");
  });
});

describe("handleClerkWebhook", () => {
  it("upserts a verified user.created delivery into D1", async () => {
    const { db, statements } = fakeDb();
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.created")), {
        type: "user.created",
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      action: "upserted",
    });
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain(CLERK_USER_UPSERT_SQL);
    expect(statements[1].sql).toContain("DELETE FROM clerk_verified_emails");
    expect(statements[0].args).toEqual([
      "user_2abc",
      "duyet@example.com",
      0, // the fixture's address carries no Clerk verification
      1_700_000_000,
      NOW_SEC,
    ]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("soft-deletes a verified user.deleted delivery", async () => {
    const { db, statements } = fakeDb();
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.deleted")), {
        type: "user.deleted",
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      action: "deleted",
    });
    expect(statements[0].sql).toContain(CLERK_USER_DELETE_SQL);
    expect(statements[0].args).toEqual([NOW_SEC, NOW_SEC, "user_2abc"]);
  });

  it("rejects a bad signature with 401 and writes nothing", async () => {
    const { db, statements } = fakeDb();
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.created")), {
        type: "user.created",
        tamperSignature: true,
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "invalid signature",
    });
    expect(statements).toEqual([]);
  });

  it("rejects a delivery signed with a different secret", async () => {
    const { db, statements } = fakeDb();
    const other = fixtureSecret("1".repeat(32));
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.created")), {
        type: "user.created",
        secret: other,
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(401);
    expect(statements).toEqual([]);
  });

  it("rejects a request with no Svix headers at all", async () => {
    const { db, statements } = fakeDb();
    const request = new Request(`https://aidr.today${CLERK_WEBHOOK_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(userEvent("user.created")),
    });
    const response = await handleClerkWebhook(request, {
      DB: db,
      CLERK_WEBHOOK_SECRET: SECRET,
    });

    expect(response.status).toBe(401);
    expect(statements).toEqual([]);
  });

  it("fails closed when the signing secret is not configured", async () => {
    const { db, statements } = fakeDb();
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.created"))),
      { DB: db }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "clerk webhook not configured",
    });
    expect(statements).toEqual([]);
  });

  it("acknowledges events that are not account lifecycle events", async () => {
    const { db, statements } = fakeDb();
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify({ data: { id: "sess_1" } }), {
        type: "session.created",
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      action: "ignored",
    });
    expect(statements).toEqual([]);
  });

  it("rejects a signed but unusable payload with 400", async () => {
    const { db, statements } = fakeDb();
    const invalidJson = await handleClerkWebhook(
      await signedRequest("not json", { type: "user.created" }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );
    expect(invalidJson.status).toBe(400);

    const invalidUser = await handleClerkWebhook(
      await signedRequest(JSON.stringify({ data: { id: "nope" } }), {
        type: "user.created",
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );
    expect(invalidUser.status).toBe(400);
    expect(statements).toEqual([]);
  });

  it("rejects an oversized body before parsing or writing", async () => {
    const { db, statements } = fakeDb();
    const response = await handleClerkWebhook(
      await signedRequest(
        JSON.stringify(
          userEvent("user.created", {
            padding: "x".repeat(CLERK_WEBHOOK_MAX_BODY_BYTES),
          })
        ),
        { type: "user.created" }
      ),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(413);
    expect(statements).toEqual([]);
  });

  it("returns 500 on a D1 write failure so Clerk redelivers", async () => {
    const { db } = fakeDb({ failOn: new Error("D1 write failed") });
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.created")), {
        type: "user.created",
      }),
      { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "sync failed" });
  });

  it("leaves a deleted account deleted when user.updated is older", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const migrationDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../migrations"
    );
    sqlite.exec(
      [
        "0026_clerk_users.sql",
        "0040_email_contributions.sql",
        "0041_clerk_verified_emails.sql",
      ]
        .map((name) => readFileSync(path.join(migrationDir, name), "utf8"))
        .join("\n")
    );
    const db = new SqliteMirror(sqlite) as unknown as D1Database;
    const deletedAt = NOW_SEC - 20;
    const staleAt = NOW_SEC - 100;
    try {
      const created = await handleClerkWebhook(
        await signedRequest(
          JSON.stringify(verifiedUser("user.created", "keep@example.com")),
          { type: "user.created", timestamp: String(NOW_SEC - 200) }
        ),
        { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
      );
      expect(created.status).toBe(200);

      const deleted = await handleClerkWebhook(
        await signedRequest(JSON.stringify(userEvent("user.deleted")), {
          type: "user.deleted",
          timestamp: String(deletedAt),
        }),
        { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
      );
      expect(deleted.status).toBe(200);

      const stale = await handleClerkWebhook(
        await signedRequest(
          JSON.stringify(verifiedUser("user.updated", "back@example.com")),
          { type: "user.updated", timestamp: String(staleAt) }
        ),
        { DB: db, CLERK_WEBHOOK_SECRET: SECRET }
      );
      expect(stale.status).toBe(200);
      await expect(stale.json()).resolves.toEqual({
        received: true,
        action: "upserted",
      });

      const row = sqlite
        .prepare("SELECT deleted_at FROM clerk_users WHERE id = ?")
        .get("user_2abc") as { deleted_at: number };
      expect(row.deleted_at).toBe(deletedAt);
      const emails = sqlite
        .prepare(
          "SELECT email FROM clerk_verified_emails WHERE user_id = ? ORDER BY email"
        )
        .all("user_2abc") as { email: string }[];
      // The stale delivery must not put the deleted account's address back.
      expect(emails.map((entry) => entry.email)).toEqual(["keep@example.com"]);
    } finally {
      sqlite.close();
    }
  });

  it("reports a missing D1 binding instead of dropping the event", async () => {
    const response = await handleClerkWebhook(
      await signedRequest(JSON.stringify(userEvent("user.created")), {
        type: "user.created",
      }),
      { CLERK_WEBHOOK_SECRET: SECRET }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "D1 binding DB not configured",
    });
  });
});
