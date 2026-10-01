import { describe, expect, it } from "vitest";
import { renderEditionEmail } from "../../worker/subscribe/send";
import { Route as SubscribeRoute } from "./api/subscribe";
import { Route as ConfirmRoute } from "./api/subscribe.confirm";
import { Route as PreviewRoute } from "./api/subscribe.preview";

type Handler = (args: {
  request: Request;
  context: unknown;
}) => Promise<Response>;

const handlers = (route: { options: { server?: unknown } }) =>
  (route.options.server as { handlers: Record<string, Handler> }).handlers;

const SNAPSHOT = {
  date: "2026-09-30",
  bullets_en: JSON.stringify(
    [1, 2, 3, 4, 5].map((n) => ({ text: `Story ${n}`, item_id: `item-${n}` }))
  ),
  bullets_vi: null,
  sent_at: null,
};
const ITEMS = [1, 2, 3, 4, 5].map((n) => ({
  id: `item-${n}`,
  image_url: `https://cdn.example/photo-${n}.jpg`,
}));

/** Minimal D1: one snapshot row, item images, and a log of bound writes. */
function fakeDb() {
  const writes: { sql: string; args: unknown[] }[] = [];
  const statement = (sql: string, args: unknown[] = []) => ({
    first: async () => (sql.includes("tldr_snapshots") ? SNAPSHOT : null),
    all: async () => ({ results: sql.includes("FROM items") ? ITEMS : [] }),
    run: async () => {
      writes.push({ sql, args });
      return { success: true };
    },
    bind: (...bound: unknown[]) => statement(sql, bound),
  });
  return {
    writes,
    db: {
      prepare: (sql: string) => statement(sql),
      batch: async () => [],
    },
  };
}

describe("POST /api/subscribe", () => {
  const post = async (body: Record<string, unknown>) => {
    const { db, writes } = fakeDb();
    const res = await handlers(SubscribeRoute).POST({
      request: new Request("https://aidr.today/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      context: { env: { DB: db } },
    });
    const insert = writes.find((w) =>
      w.sql.includes("INSERT INTO subscribers")
    );
    return { res, insert, writes };
  };

  it("stores a new signup as pending until the confirmation link is clicked", async () => {
    // Double opt-in: digests only go to confirmed rows, so a typo'd or
    // third-party address never gets more than the one confirmation mail.
    const { res, insert } = await post({ email: "reader@aidr.today" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pending: true });
    expect(insert?.sql).toContain("VALUES (?, ?, ?, ?, 0,");
    // Re-submitting the form must never un-confirm an existing reader.
    expect(insert?.sql).not.toMatch(/confirmed\s*=/);
  });

  it("rejects reserved domains that can only bounce", async () => {
    const { res, insert } = await post({ email: "cors-test@example.com" });
    expect(res.status).toBe(400);
    expect(insert).toBeUndefined();
  });

  it("stores the image layout chosen in the form", async () => {
    const { res, insert } = await post({
      email: "reader@aidr.today",
      lang: "en",
      digest_size: 10,
      mail_format: "large",
    });
    expect(res.status).toBe(200);
    expect(insert?.sql).toContain("mail_format = excluded.mail_format");
    // A re-subscribe must overwrite the old layout, not keep it.
    expect(insert?.args.slice(-2)).toEqual([10, "large"]);
  });

  it("falls back to the default layout for an unknown value", async () => {
    const { insert } = await post({
      email: "reader@aidr.today",
      mail_format: "huge",
    });
    expect(insert?.args.at(-1)).toBe("design");
  });
});

describe("GET /api/subscribe/preview", () => {
  const preview = async (query: string) => {
    const { db } = fakeDb();
    const res = await handlers(PreviewRoute).GET({
      request: new Request(`https://aidr.today/api/subscribe/preview?${query}`),
      context: { env: { DB: db } },
    });
    return { html: await res.text(), db };
  };

  it("passes the layout and story count to the renderer", async () => {
    const large = (await preview("lang=en&n=3&format=large")).html;
    expect(large.match(/class="mail-large"/g)?.length).toBe(3);
    expect(large).not.toContain("Story 4");

    const none = (await preview("lang=en&n=5&format=no-images")).html;
    expect(none).toContain("Story 5");
    expect(none).not.toContain("cdn.example");

    const thumbs = (await preview("lang=en&format=design")).html;
    expect(thumbs.match(/class="mail-hero"/g)?.length).toBe(1);
    expect(thumbs.match(/<img [^>]*width="64"/g)?.length).toBe(5);
  });

  it("is the mail the send path renders, byte for byte", async () => {
    // The preview only adds <base> so links leave the iframe. Anything else
    // that differs means the preview no longer shows what arrives.
    const { html, db } = await preview("lang=en&n=3&format=large");
    const sent = await renderEditionEmail(
      { DB: db as unknown as D1Database },
      {
        date: SNAPSHOT.date,
        lang: "en",
        bullets: JSON.parse(SNAPSHOT.bullets_en).slice(0, 3),
      },
      "preview",
      3,
      "large"
    );
    expect(html.replace('<base target="_blank">', "")).toBe(sent.html);
    expect(html).toContain(`<title>${sent.subject}</title>`);
  });
});

describe("GET /api/subscribe/confirm", () => {
  it("sends an unknown token back to the signup page instead of erroring", async () => {
    const { db } = fakeDb();
    const res = await handlers(ConfirmRoute).GET({
      request: new Request(
        "https://aidr.today/api/subscribe/confirm?token=nope"
      ),
      context: { env: { DB: db } },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://aidr.today/subscribe");
  });
});
