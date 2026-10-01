import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { isAuthenticatedSender } from "../src/auth.js";
import { receiveEmail } from "../src/intake.js";

// The shared `aidr` D1 schema lives with the web app.
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../web/migrations"
);

type SqliteInput = null | number | bigint | string | NodeJS.ArrayBufferView;

class SqliteD1 {
  constructor(readonly db: DatabaseSync) {}
  prepare(sql: string) {
    const statement = this.db.prepare(sql);
    let args: SqliteInput[] = [];
    const prepared = {
      bind: (...next: unknown[]) => {
        args = next as SqliteInput[];
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
}

const USER = "user_alice";
const ALICE = "alice@example.com";
let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationsDir).sort()) {
    if (file.endsWith(".sql")) {
      db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    }
  }
  db.prepare(
    "INSERT INTO clerk_users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, 1, 0, 0)"
  ).run(USER, ALICE);
});

function raw(opts: {
  from?: string;
  subject?: string;
  body: string;
  auth?: string | null;
  top?: string[];
  extraHeaders?: string[];
  messageId?: string;
}): string {
  const from = opts.from ?? ALICE;
  const domain = from.split("@")[1];
  const auth =
    opts.auth === undefined
      ? `mx.cloudflare.net; dkim=pass header.d=${domain} header.s=s1; spf=pass smtp.mailfrom=${from}; dmarc=pass header.from=${domain}`
      : opts.auth;
  return [
    ...(opts.top ?? []),
    ...(auth ? [`Authentication-Results: ${auth}`] : []),
    "Received: from mail.example.com by mx.cloudflare.net",
    `From: Alice <${from}>`,
    "To: submit@aidr.today",
    `Subject: ${opts.subject ?? "hello"}`,
    `Message-ID: ${opts.messageId ?? `<${crypto.randomUUID()}@example.com>`}`,
    ...(opts.extraHeaders ?? []),
    "Content-Type: text/plain; charset=utf-8",
    "",
    opts.body,
    "",
  ].join("\r\n");
}

const D1 = () => new SqliteD1(db) as unknown as D1Database;
const receive = (message: string, from = ALICE, to = "submit@aidr.today") =>
  receiveEmail(D1(), { from, to, raw: message });
const rows = () =>
  db.prepare("SELECT * FROM inbound_emails").all() as Array<
    Record<string, unknown>
  >;

describe("sender validation", () => {
  it("ignores a stranger and stores no content or address", async () => {
    const out = await receive(
      raw({ from: "mallory@example.org", body: "https://evil.example/x" }),
      "mallory@example.org"
    );
    expect(out).toEqual({ status: "ignored", reason: "unknown_sender" });
    const [row] = rows();
    expect(row).toMatchObject({
      status: "ignored",
      sender_email: null,
      own_text: null,
      user_id: null,
    });
  });

  it("ignores a spoofed account address DKIM-signed by another domain", async () => {
    // Exactly the p=none spoof Email Routing lets through.
    const out = await receive(
      raw({
        body: "https://example.com/story",
        auth: "mx.cloudflare.net; dkim=pass header.d=attacker.test; spf=pass smtp.mailfrom=bounce@attacker.test; dmarc=none",
      })
    );
    expect(out).toEqual({ status: "ignored", reason: "unauthenticated" });
  });

  it("ignores a forged Cloudflare header that sits below a relay's Received line", async () => {
    const out = await receive(
      raw({
        body: "https://example.com/story",
        auth: null,
        top: ["Received: from evil.test by mx.cloudflare.net"],
        extraHeaders: [
          "Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.com",
        ],
      })
    );
    expect(out).toEqual({ status: "ignored", reason: "unauthenticated" });
  });

  it("ignores an account email Clerk has not verified", async () => {
    db.prepare("UPDATE clerk_users SET email_verified = 0").run();
    expect(await receive(raw({ body: "hi" }))).toEqual({
      status: "ignored",
      reason: "unknown_sender",
    });
  });

  it("ignores a soft-deleted account", async () => {
    db.prepare("UPDATE clerk_users SET deleted_at = 1").run();
    expect(await receive(raw({ body: "hi" }))).toEqual({
      status: "ignored",
      reason: "unknown_sender",
    });
  });

  it("ignores an extra address until it is confirmed, then accepts it for its owner", async () => {
    const work = "alice@work.test";
    db.prepare(
      "INSERT INTO contributor_emails (id, user_id, email, status, created_at) VALUES ('a1', ?, ?, 'pending', 0)"
    ).run(USER, work);
    expect(await receive(raw({ from: work, body: "hi there" }), work)).toEqual({
      status: "ignored",
      reason: "unknown_sender",
    });

    db.prepare("UPDATE contributor_emails SET status = 'confirmed'").run();
    const out = await receive(raw({ from: work, body: "hi there" }), work);
    expect(out.status).toBe("pending");
    expect(rows().find((r) => r.status === "pending")).toMatchObject({
      user_id: USER,
      sender_email: work,
    });
  });
});

describe("loop protection", () => {
  it.each([
    "Auto-Submitted: auto-replied",
    "Precedence: bulk",
    "List-Id: <news.example.com>",
  ])("ignores automated mail (%s)", async (header) => {
    expect(
      await receive(raw({ body: "out of office", extraHeaders: [header] }))
    ).toEqual({ status: "ignored", reason: "automated" });
  });

  it("ignores bounces with an empty envelope sender", async () => {
    expect(await receive(raw({ body: "failed" }), "")).toEqual({
      status: "ignored",
      reason: "automated",
    });
  });

  it("stores a redelivered message once", async () => {
    const message = raw({ body: "hello", messageId: "<same@x>" });
    expect((await receive(message)).status).toBe("pending");
    expect(await receive(message)).toEqual({
      status: "ignored",
      reason: "duplicate",
    });
  });
});

describe("parsing", () => {
  it("stores a forward's links but not the forwarded body", async () => {
    await receive(
      raw({
        subject: "Fwd: Big model launch",
        body: [
          "worth a look",
          "",
          "---------- Forwarded message ---------",
          "From: News <news@example.com>",
          "Secret newsletter text",
          "Read more: https://news.example.com/launch?utm_source=nl",
          "Unsubscribe: https://news.example.com/unsubscribe?u=1",
        ].join("\r\n"),
      })
    );
    const [row] = rows();
    expect(row).toMatchObject({
      status: "pending",
      is_forward: 1,
      own_text: "worth a look",
      forwarded_links: JSON.stringify(["https://news.example.com/launch"]),
    });
    expect(JSON.stringify(row)).not.toContain("Secret newsletter text");
  });

  it("finds the story from the user's own text, never from our quoted digest", async () => {
    await receive(
      raw({
        subject: "Re: AI;DR digest",
        body: [
          "The title of https://aidr.today/abcdef01 is wrong.",
          "",
          "On Mon, Oct 1, 2026 at 7:00 AM AI;DR <digest@aidr.today> wrote:",
          "> https://aidr.today/ffffffff other story",
        ].join("\r\n"),
      })
    );
    const [row] = rows();
    expect(row).toMatchObject({
      is_reply: 1,
      story_ref: "abcdef01",
      own_text: "The title of https://aidr.today/abcdef01 is wrong.",
    });
  });

  it("reads the story marker from a reply subject", async () => {
    await receive(
      raw({ subject: "Re: Your suggestion [aidr:abcdef01:en]", body: "ok" })
    );
    expect(rows()[0]).toMatchObject({
      story_ref: "abcdef01",
      story_lang: "en",
    });
  });

  it("ignores a reply with nothing of the user's own", async () => {
    expect(
      await receive(
        raw({
          subject: "Re: AI;DR digest",
          body: "On Mon, Oct 1, 2026, AI;DR <digest@aidr.today> wrote:\r\n> https://example.com/a",
        })
      )
    ).toEqual({ status: "ignored", reason: "empty" });
  });
});

it("requires From alignment with a Cloudflare pass", () => {
  const h = (value: string) => [{ key: "authentication-results", value }];
  expect(
    isAuthenticatedSender(
      h("mx.cloudflare.net; spf=pass smtp.mailfrom=a@mail.example.com"),
      "a@example.com"
    )
  ).toBe(true);
  expect(
    isAuthenticatedSender(
      h("mx.cloudflare.net; dkim=pass header.d=example.com; dmarc=fail"),
      "a@example.com"
    )
  ).toBe(false);
  expect(isAuthenticatedSender([], "a@example.com")).toBe(false);
});
