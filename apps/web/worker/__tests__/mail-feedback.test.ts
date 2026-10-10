import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  feedbackCounts,
  feedbackUrl,
  handleFeedbackRequest,
  parseFeedbackParams,
} from "../mail/feedback.js";
import { renderDigestEmail } from "../mail/render.js";
import type { Env } from "../types.js";

const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0054_email_feedback.sql"
  ),
  "utf8"
);

/** Minimal D1 over node:sqlite with the real 0054 schema. */
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE subscribers (email TEXT, unsubscribe_token TEXT UNIQUE);"
  );
  db.exec(migration);
  db.prepare(
    "INSERT INTO subscribers (email, unsubscribe_token) VALUES (?, ?)"
  ).run("r@aidr.today", "tok-1");
  db.prepare(
    "INSERT INTO subscribers (email, unsubscribe_token) VALUES (?, ?)"
  ).run("s@aidr.today", "tok-2");
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a;
        return stmt;
      },
      first: async () =>
        (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
      run: async () => db.prepare(sql).run(...(args as never[])),
    };
    return stmt;
  };
  return { env: { DB: { prepare } } as unknown as Env, db };
}

const click = (env: Env, url: string) =>
  handleFeedbackRequest(env, new URL(url));

describe("feedback links", () => {
  it("round-trip through the parser", () => {
    const url = new URL(feedbackUrl("2026-10-10", "vi", 1, "tok-1"));
    expect(url.pathname).toBe("/feedback");
    expect(parseFeedbackParams(url.searchParams)).toEqual({
      date: "2026-10-10",
      lang: "vi",
      vote: 1,
      token: "tok-1",
    });
  });

  it("reject malformed params", () => {
    for (const q of [
      "d=x&l=en&v=1&t=a",
      "d=2026-10-10&l=fr&v=1&t=a",
      "d=2026-10-10&l=en&v=2&t=a",
      "d=2026-10-10&l=en&v=1",
    ]) {
      expect(parseFeedbackParams(new URLSearchParams(q))).toBeNull();
    }
  });

  it("are in the digest only when a subscriber token is given", () => {
    const base = {
      date: "2026-10-10",
      lang: "en" as const,
      stories: [{ text: "A story. More." }],
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=t",
      settingsUrl: "https://aidr.today/subscribe?settings=t",
    };
    expect(renderDigestEmail(base).html).not.toContain("/feedback?");
    const { html } = renderDigestEmail({ ...base, feedbackToken: "tok-1" });
    expect(html).toContain(
      "Was today&#39;s edition useful?".replace("&#39;", "'")
    );
    expect(html).toContain(
      "/feedback?d=2026-10-10&amp;l=en&amp;v=1&amp;t=tok-1"
    );
    expect(html).toContain(
      "/feedback?d=2026-10-10&amp;l=en&amp;v=0&amp;t=tok-1"
    );
  });
});

describe("GET /feedback", () => {
  it("stores one vote per subscriber and date; a repeat click overwrites it", async () => {
    const { env, db } = d1();
    const base = "https://aidr.today/feedback?d=2026-10-10&l=en&t=tok-1";
    expect((await click(env, `${base}&v=1`)).status).toBe(200);
    expect((await click(env, `${base}&v=1`)).status).toBe(200);
    let rows = db.prepare("SELECT vote FROM email_feedback").all();
    expect(rows).toEqual([{ vote: 1 }]);
    // Link scanners may pre-click; the reader's own later click wins.
    await click(env, `${base}&v=0`);
    rows = db.prepare("SELECT vote FROM email_feedback").all();
    expect(rows).toEqual([{ vote: 0 }]);
  });

  it("ignores tokens that match no subscriber, but still thanks the reader", async () => {
    const { env, db } = d1();
    const res = await click(
      env,
      "https://aidr.today/feedback?d=2026-10-10&l=vi&v=1&t=nobody"
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Cảm ơn bạn");
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM email_feedback").get()
    ).toEqual({ n: 0 });
  });

  it("answers a malformed link with 400 and stores nothing", async () => {
    const { env } = d1();
    const res = await click(
      env,
      "https://aidr.today/feedback?d=bad&l=en&v=1&t=tok-1"
    );
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("not valid");
  });

  it("counts yes and no per date and language for the admin view", async () => {
    const { env } = d1();
    await click(
      env,
      "https://aidr.today/feedback?d=2026-10-10&l=en&v=1&t=tok-1"
    );
    await click(
      env,
      "https://aidr.today/feedback?d=2026-10-10&l=en&v=0&t=tok-2"
    );
    await click(
      env,
      "https://aidr.today/feedback?d=2026-10-09&l=vi&v=1&t=tok-1"
    );
    expect(await feedbackCounts(env)).toEqual([
      { date: "2026-10-10", lang: "en", yes: 1, no: 1 },
      { date: "2026-10-09", lang: "vi", yes: 1, no: 0 },
    ]);
  });
});
