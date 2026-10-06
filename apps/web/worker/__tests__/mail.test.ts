import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  MAIL_FORMATS,
  mailFormatHasImages,
  normalizeMailFormat,
} from "../../src/lib/mail-format.js";
import { topicColor } from "../../src/lib/topic-color.js";
import { previewCampaign, sendCampaign } from "../mail/campaigns.js";
import { parseWrapJson } from "../mail/compose.js";
import { parseRssItems } from "../mail/content.js";
import { markdownToEmailHtml, markdownToPlainText } from "../mail/markdown.js";
import {
  listUnsubscribeHeaders,
  MAIL_LOGO_URL,
  NEWS_FROM,
  NOTES_FROM,
  renderDigestEmail,
  renderNoteEmail,
  settingsUrl,
  unsubscribeUrl,
} from "../mail/render.js";
import { resetMailSchemaCache } from "../mail/schema.js";
import { digestFrom, notesFrom, sendSubscriberEmail } from "../mail/send.js";
import {
  applyPlaceholders,
  applyTemplate,
  templateById,
} from "../mail/templates.js";
import { isAllowedOrigin } from "../subscribe/cors.js";

const publicLogo = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../public/logo-icon.png"
);

describe("markdownToEmailHtml", () => {
  it("escapes HTML then restores links, bold, and lists", () => {
    const html = markdownToEmailHtml(
      `Hello **world**\n\n- one\n- [two](https://duyet.net)\n\n<script>x</script>`
    );
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain('href="https://duyet.net/"');
    expect(html).toContain("<li");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects javascript: links", () => {
    const html = markdownToEmailHtml("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("x");
  });

  it("renders headings", () => {
    const html = markdownToEmailHtml("# Title\n\n## Sub");
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
  });
});

describe("markdownToPlainText", () => {
  it("strips marks and keeps link URLs", () => {
    expect(markdownToPlainText("**Hi** [a](https://x.com)")).toBe(
      "Hi a (https://x.com)"
    );
  });
});

describe("templates", () => {
  it("fills placeholders on the post template", () => {
    const post = templateById("post");
    expect(post).toBeDefined();
    const applied = applyTemplate(post!, {
      title: "A post",
      excerpt: "Lede.",
      url: "https://blog.duyet.net/2026/08/a-post",
    });
    expect(applied.subject).toBe("A post");
    expect(applied.cta_url).toBe("https://blog.duyet.net/2026/08/a-post");
    expect(applied.body_md).toContain("Lede.");
  });

  it("drops unknown placeholders", () => {
    expect(applyPlaceholders("x {{missing}} y", {})).toBe("x  y");
  });
});

describe("parseWrapJson", () => {
  it("accepts a JSON object with body_md", () => {
    const parsed = parseWrapJson(
      '{"subject":"S","preheader":"P","body_md":"Hello","cta_label":"Go","cta_url":"https://duyet.net"}'
    );
    expect(parsed).toEqual({
      subject: "S",
      preheader: "P",
      body_md: "Hello",
      cta_label: "Go",
      cta_url: "https://duyet.net",
    });
  });

  it("extracts JSON from surrounding text", () => {
    const parsed = parseWrapJson(
      'noise {"subject":"S","body_md":"Hi"} trailing'
    );
    expect(parsed).toEqual({
      subject: "S",
      preheader: "",
      body_md: "Hi",
      cta_label: "",
      cta_url: "",
    });
  });

  it("rejects missing body", () => {
    expect(parseWrapJson('{"subject":"S"}')).toBeNull();
  });

  it("rejects missing subject", () => {
    expect(parseWrapJson('{"body_md":"Hi"}')).toBeNull();
  });
});

describe("MAIL_LOGO_URL", () => {
  it("points at the unhashed public PNG, which exists", () => {
    expect(MAIL_LOGO_URL).toBe("https://aidr.today/logo-icon.png");
    const bytes = readFileSync(publicLogo);
    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });
});

describe("renderNoteEmail", () => {
  it("emits a 540px table layout with logo, wordmark, CTA, and unsubscribe", () => {
    const { html, text } = renderNoteEmail({
      subject: "A note",
      preheader: "Inbox preview",
      bodyMd: "Hello **friend**.",
      lang: "en",
      cta: { label: "Read", url: "https://blog.duyet.net/x" },
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain("max-width:540px");
    expect(html).toContain(`src="${MAIL_LOGO_URL}"`);
    expect(html).toContain('width="72"');
    expect(html).toContain('height="72"');
    expect(html).toContain('alt="AI;DR"');
    expect(MAIL_LOGO_URL).toBe("https://aidr.today/logo-icon.png");
    expect(html).toContain("https://aidr.today/logo-icon.png");
    expect(html).not.toContain("/assets/logo");
    expect(html).toContain("padding:32px");
    expect(html).toContain("padding:14px 28px");
    expect(html).toContain("padding:28px 32px 48px");
    expect(html).toContain('<font color="#fffefb">');
    expect(html).toContain('id="body"');
    expect(html).toContain("mail-cta");
    expect(html).toContain("AI;DR");
    expect(html).toContain("AI news ranked and summary");
    expect(html).toContain("Inbox preview");
    expect(html).toContain("#b45309");
    expect(html).toContain("#fffefb !important");
    expect(html).toContain("text-decoration:none !important");
    expect(html).toContain("background-color:#b45309");
    expect(html).toContain("#f7f7f5");
    expect(html).toContain("#ffffff");
    expect(html).toContain("'EB Garamond', Garamond, Georgia");
    expect(html).toContain("'Source Sans 3', -apple-system");
    expect(html).not.toContain('font-family:Georgia,"');
    expect(html).not.toContain('"Times New Roman"');
    expect(html).not.toContain('"Source Sans 3"');
    expect(html).not.toContain('"Segoe UI"');
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("Adjust settings");
    expect(html).toContain("/data");
    expect(html).toMatch(/color:#b45309;text-decoration:none/);
    expect(text).toContain("Hello friend.");
    expect(text).toContain("Read: https://blog.duyet.net/x");
    expect(text).toContain("Adjust settings:");
  });

  it("uses Vietnamese header tagline and footer labels", () => {
    const { html, text } = renderNoteEmail({
      subject: "Chào",
      bodyMd: "Xin chào",
      lang: "vi",
      cta: { label: "Mở aidr.today", url: "https://aidr.today" },
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain("Tin AI xếp hạng và tóm tắt");
    expect(html).toContain("Hủy đăng ký");
    expect(html).toContain("Chỉnh cài đặt");
    expect(html).toContain("Mở aidr.today");
    expect(html).toContain("utm_medium=welcome");
    expect(text).toContain("Hủy đăng ký:");
  });

  it("keeps tokenized footer links in the selected language", () => {
    expect(unsubscribeUrl("tok-en", "en")).toBe(
      "https://aidr.today/subscribe?unsubscribe=tok-en&lang=en"
    );
    expect(settingsUrl("tok-en", "en")).toBe(
      "https://aidr.today/subscribe?settings=tok-en&lang=en"
    );
    const { html, text } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [{ text: "English story" }],
      lang: "en",
      unsubscribeUrl: unsubscribeUrl("secret-token", "en"),
      settingsUrl: settingsUrl("secret-token", "en"),
    });
    expect(html).toContain("unsubscribe=secret-token&amp;lang=en");
    expect(html).toContain("settings=secret-token&amp;lang=en");
    expect(text).toContain("unsubscribe=secret-token&lang=en");
  });

  it("shares the logo shell with digest mail", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [{ text: "Story one", url: "https://aidr.today/" }],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain(`src="${MAIL_LOGO_URL}"`);
    expect(html).toContain("max-width:540px");
    expect(html).toContain("#fffefb !important");
    expect(html).toContain("Read on aidr.today");
    expect(html).toContain("utm_source=email");
    expect(html).toContain("utm_medium=digest");
    expect(html).toContain("2026-09-10");
    expect(html).toContain("Story one");
    expect(html).toContain("border-bottom:1px solid");
    expect(html).toContain(
      'style="color:#b45309;text-decoration:underline;font-weight:500"'
    );
    expect(html).not.toContain('font-family:Georgia,"');
    expect(html).not.toContain('"Times New Roman"');
    expect(html).not.toContain(
      "color:#0a0a0a;text-decoration:none;font-weight:500"
    );
    expect(html).toContain('class="mail-story"');
    expect(html).toContain(">Read more</a>");
    expect(html).not.toContain(">Story one</a>");
  });

  it("keeps digest story body as plain text with a bottom Read more link", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [
        { text: "No url story" },
        { text: "Has url", url: "https://example.com/x" },
      ],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain('class="mail-story"');
    expect(html).not.toContain(">No url story</a>");
    expect(html).not.toContain(">Has url</a>");
    expect(html).toContain("No url story");
    expect(html).toContain("Has url");
    expect(html).toContain(">Read more</a>");
    expect(html).toContain("utm_medium=digest");
    expect(html).toContain('href="https://example.com/x"');
    expect(
      (html.match(/text-decoration:underline;font-weight:500/g) ?? []).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("uses Đọc thêm for Vietnamese digest story links", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [{ text: "Tin một", url: "https://aidr.today/ai/abcd1234" }],
      lang: "vi",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain(">Đọc thêm</a>");
    expect(html).not.toContain(">Tin một</a>");
    expect(html).toContain("Tin một");
  });

  it("omits non-http(s) CTA urls", () => {
    const { html, text } = renderNoteEmail({
      subject: "A note",
      bodyMd: "Hello",
      cta: { label: "Bad", url: "javascript:alert(1)" },
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain(">Bad<");
    expect(text).not.toContain("Bad:");
  });

  it("renders a thumbnail when the story has an imageUrl", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [
        {
          text: "Story with thumb",
          url: "https://aidr.today/ai/abcd1234",
          imageUrl: "https://aidr.today/og/abc.png",
        },
        { text: "Story without thumb", url: "https://aidr.today/" },
      ],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain('src="https://aidr.today/og/abc.png"');
    expect(html).toContain('width="64"');
    // The hero is the day card, never a story's own image.
    expect(html).toContain(
      'class="mail-hero" src="https://aidr.today/api/og/date/2026-09-10.png?lang=en"'
    );
    expect(html.match(/<img /g)?.length).toBe(3);
  });

  describe("image layouts", () => {
    const render = (format: string | undefined) =>
      renderDigestEmail({
        subject: "Digest",
        date: "2026-09-10",
        stories: [
          { text: "Generated card", imageUrl: "https://aidr.today/og/abc.png" },
          { text: "Real photo", imageUrl: "https://cdn.example/photo.jpg" },
          { text: "No image" },
        ],
        lang: "en",
        unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
        settingsUrl: "https://aidr.today/subscribe?settings=tok",
        format: format as never,
      }).html;
    // The logo is the one <img> every layout has.
    const images = (html: string) => html.match(/<img /g)?.length ?? 0;

    it("no-images keeps the designed card but shows no story image", () => {
      const html = render("no-images");
      expect(images(html)).toBe(1);
      expect(html).not.toContain("cdn.example");
      expect(html).toContain(">Read more</a>");
    });

    it("design shows one hero and a small thumbnail per story image", () => {
      const html = render("design");
      expect(html.match(/class="mail-hero"/g)?.length).toBe(1);
      expect(html.match(/<img [^>]*width="64"/g)?.length).toBe(2);
      expect(html).not.toContain('class="mail-large"');
      expect(images(html)).toBe(4);
      expect(render(undefined)).toBe(html);
    });

    it("large shows the day card and one full-width image per story", () => {
      const html = render("large");
      // The day card is the whole day, so it does not repeat story 1's image.
      expect(html.match(/class="mail-hero"/g)?.length).toBe(1);
      expect(html).not.toContain('width="64"');
      expect(html.match(/class="mail-large"/g)?.length).toBe(1);
      expect(html).toContain(
        'class="mail-large" src="https://cdn.example/photo.jpg" width="476"'
      );
      // Generated text-on-card images are unreadable noise at full width.
      expect(html).not.toContain("/og/abc.png");
    });

    it("text has no story image and no story markup", () => {
      const html = render("text");
      expect(images(html)).toBe(1);
      expect(html).toContain("white-space:pre-wrap");
      expect(html).not.toContain('class="mail-story"');
    });
  });

  it("normalizes stored layouts and defaults to design", () => {
    for (const format of MAIL_FORMATS) {
      expect(normalizeMailFormat(format)).toBe(format);
    }
    // `design` is the column default, so old rows keep their thumbnails.
    expect(normalizeMailFormat(null)).toBe("design");
    expect(normalizeMailFormat("huge")).toBe("design");
    expect(MAIL_FORMATS.filter(mailFormatHasImages)).toEqual([
      "design",
      "large",
    ]);
  });

  it("uses the site font families with a webfont link and a valid stack", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [{ text: "Story" }],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500&amp;family=Source+Sans+3:wght@400;500;600&amp;display=swap">'
    );
    expect(html).toContain("font-family:'Source Sans 3', -apple-system");
    expect(html).toContain("font-family:'EB Garamond', Garamond");
    // Unquoted `Source Sans 3` is invalid CSS and drops the declaration;
    // a double quote would end the style attribute.
    expect(html).not.toMatch(/font-family:[^;"]*[^'"]Source Sans 3/);
    expect(html).not.toMatch(/font-family:[^;]*"[^>]*;/);
  });

  it("drops non-http(s) story imageUrls", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [{ text: "Bad thumb", imageUrl: "javascript:alert(1)" }],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).not.toContain("javascript:");
    // Logo and day card only.
    expect(html.match(/<img /g)?.length).toBe(2);
  });

  it("colors keywords with the website topic palette", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [
        { text: "OpenAI releases a new model", url: "https://aidr.today/" },
      ],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain(
      `<span style="color:${topicColor("OpenAI").light};font-weight:600">OpenAI</span>`
    );
  });

  it("escapes markup before highlighting keywords", () => {
    const { html } = renderDigestEmail({
      subject: "Digest",
      date: "2026-09-10",
      stories: [
        {
          text: "OpenAI <script>alert(1)</script>",
          url: "https://aidr.today/",
        },
      ],
      lang: "en",
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(
      `<span style="color:${topicColor("OpenAI").light};font-weight:600">OpenAI</span>`
    );
  });
});

describe("previewCampaign", () => {
  it("renders campaign markdown", () => {
    const { html } = previewCampaign({
      subject: "Hi",
      preheader: "",
      body_md: "Body",
      cta_label: "",
      cta_url: "",
    });
    expect(html).toContain("Body");
  });
});

describe("from addresses", () => {
  it("defaults digest and notes senders to aidr.today", () => {
    expect(NEWS_FROM.email).toBe("digest@aidr.today");
    expect(NOTES_FROM.email).toBe("notes@aidr.today");
    const env = {} as import("../types.js").Env;
    expect(digestFrom(env).email).toBe("digest@aidr.today");
    expect(notesFrom(env).email).toBe("notes@aidr.today");
    expect(
      digestFrom({
        EMAIL_FROM: "hello@aidr.today",
      } as import("../types.js").Env).email
    ).toBe("hello@aidr.today");
  });
});

describe("reply-to", () => {
  it("sends subscriber mail with Reply-To submit@aidr.today", async () => {
    const send = vi.fn(async () => {});
    const env = { EMAIL: { send } } as unknown as import("../types.js").Env;
    const ok = await sendSubscriberEmail(env, {
      to: "reader@example.com",
      from: { email: "digest@aidr.today", name: "aidr" },
      subject: "AI;DR",
      html: "<p>hi</p>",
      text: "hi",
      unsubscribeToken: "tok",
    });
    expect(ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "submit@aidr.today" })
    );
  });
});

describe("listUnsubscribeHeaders", () => {
  it("includes one-click POST and the selected-language page URL", () => {
    const headers = listUnsubscribeHeaders("abc", "en");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toContain("/api/subscribe?token=abc");
    expect(headers["List-Unsubscribe"]).toContain(
      "/subscribe?unsubscribe=abc&lang=en"
    );
  });
});

describe("cors origins", () => {
  it("allows blog, home, news, and local dev", () => {
    expect(isAllowedOrigin("https://blog.duyet.net")).toBe(true);
    expect(isAllowedOrigin("https://duyet.net")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("https://duyet-blog.pages.dev")).toBe(true);
    expect(isAllowedOrigin("https://random.pages.dev")).toBe(false);
  });
});

describe("parseRssItems", () => {
  it("reads title, link, and stripped description", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title><![CDATA[Post & notes]]></title>
        <link>https://blog.duyet.net/2026/08/post</link>
        <description><![CDATA[<p>Hello</p>]]></description>
      </item>
    </channel></rss>`;
    expect(parseRssItems(xml)).toEqual([
      {
        kind: "blog",
        title: "Post & notes",
        url: "https://blog.duyet.net/2026/08/post",
        excerpt: "Hello",
      },
    ]);
  });
});

type SqliteArg = null | number | bigint | string | NodeJS.ArrayBufferView;

/** In-memory D1. Applies the UPDATE `sendCampaign` runs so tests can read it. */
function mailD1(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      let args: SqliteArg[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          args = values as SqliteArg[];
          return stmt;
        },
        async first<T>() {
          return (db.prepare(sql).get(...args) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...args) as T[] };
        },
        async run() {
          db.prepare(sql).run(...args);
          return { success: true, meta: { changes: 0 } };
        },
      };
      return stmt;
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  } as unknown as D1Database;
}

function seedMailDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE subscribers (
      email TEXT PRIMARY KEY,
      confirmed INTEGER NOT NULL DEFAULT 0,
      unsubscribe_token TEXT NOT NULL
    );
    CREATE TABLE email_campaigns (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      subject TEXT NOT NULL,
      preheader TEXT NOT NULL DEFAULT '',
      body_md TEXT NOT NULL DEFAULT '',
      cta_label TEXT NOT NULL DEFAULT '',
      cta_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE email_sends (
      campaign_id TEXT NOT NULL,
      email TEXT NOT NULL,
      sent_at INTEGER,
      error TEXT,
      PRIMARY KEY (campaign_id, email)
    );
  `);
  return db;
}

const CAMPAIGN_ID = "camp-partial";

function seedCampaign(
  db: DatabaseSync,
  status = "draft",
  failedCount = 0,
  sentCount = 0
): void {
  db.prepare(
    `INSERT INTO email_campaigns
       (id, subject, preheader, body_md, cta_label, cta_url, status,
        created_at, updated_at, sent_count, failed_count)
     VALUES (?, 'Hello', '', 'Body', '', '', ?, 1, 1, ?, ?)`
  ).run(CAMPAIGN_ID, status, sentCount, failedCount);
}

function seedSubscriber(db: DatabaseSync, email: string, confirmed = 1): void {
  db.prepare(
    `INSERT INTO subscribers (email, confirmed, unsubscribe_token)
     VALUES (?, ?, ?)`
  ).run(email, confirmed, `tok-${email}`);
}

function storedCampaign(db: DatabaseSync): {
  status: string;
  sent_count: number;
  failed_count: number;
} {
  return db
    .prepare(
      `SELECT status, sent_count, failed_count
       FROM email_campaigns WHERE id = ?`
    )
    .get(CAMPAIGN_ID) as {
    status: string;
    sent_count: number;
    failed_count: number;
  };
}

function campaignEnv(
  db: DatabaseSync,
  send: (mail: { to: string }) => Promise<void>
): import("../types.js").Env {
  return {
    DB: mailD1(db),
    EMAIL: { send },
  } as unknown as import("../types.js").Env;
}

describe("sendCampaign", () => {
  it("returns 400 when nobody is confirmed", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    seedCampaign(db);
    seedSubscriber(db, "quiet@example.com", 0);
    const send = vi.fn(async () => {});
    const result = await sendCampaign(campaignEnv(db, send), CAMPAIGN_ID);
    expect(result).toEqual({ error: "no subscribers", status: 400 });
    expect(storedCampaign(db).status).toBe("draft");
    expect(send).not.toHaveBeenCalled();
  });

  it("stays draft when one recipient fails", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    seedCampaign(db);
    seedSubscriber(db, "ok@example.com");
    seedSubscriber(db, "bad@example.com");
    const result = await sendCampaign(
      campaignEnv(db, async (mail) => {
        if (mail.to === "bad@example.com") throw new Error("smtp down");
      }),
      CAMPAIGN_ID
    );
    expect(result).toEqual({ ok: true, sent: 1, failed: 1 });
    expect(storedCampaign(db)).toMatchObject({
      status: "draft",
      failed_count: 1,
    });
  });

  it("retries only the address that failed, then marks sent", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    seedCampaign(db);
    seedSubscriber(db, "ok@example.com");
    seedSubscriber(db, "bad@example.com");
    const reject = new Set(["bad@example.com"]);
    const mailed: string[] = [];
    const env = campaignEnv(db, async (mail) => {
      mailed.push(mail.to);
      if (reject.has(mail.to)) throw new Error("smtp down");
    });
    const first = await sendCampaign(env, CAMPAIGN_ID);
    expect(first).toEqual({ ok: true, sent: 1, failed: 1 });
    expect(storedCampaign(db)).toMatchObject({
      status: "draft",
      failed_count: 1,
    });

    mailed.length = 0;
    reject.clear();
    const second = await sendCampaign(env, CAMPAIGN_ID);
    expect(mailed).toEqual(["bad@example.com"]);
    expect(second).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(storedCampaign(db)).toMatchObject({
      status: "sent",
      failed_count: 0,
    });
  });

  it("retries a campaign left marked sent with failures", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    seedCampaign(db, "sent", 1);
    seedSubscriber(db, "ok@example.com");
    seedSubscriber(db, "bad@example.com");
    db.prepare(
      `INSERT INTO email_sends (campaign_id, email, sent_at, error)
       VALUES (?, 'ok@example.com', 1, NULL)`
    ).run(CAMPAIGN_ID);
    db.prepare(
      `INSERT INTO email_sends (campaign_id, email, sent_at, error)
       VALUES (?, 'bad@example.com', 1, 'email send failed')`
    ).run(CAMPAIGN_ID);

    const mailed: string[] = [];
    const result = await sendCampaign(
      campaignEnv(db, async (mail) => {
        mailed.push(mail.to);
      }),
      CAMPAIGN_ID
    );
    expect(mailed).toEqual(["bad@example.com"]);
    expect(result).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(storedCampaign(db)).toMatchObject({
      status: "sent",
      failed_count: 0,
    });
  });

  it("adds a retry's sends to sent_count instead of replacing it", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    seedCampaign(db);
    seedSubscriber(db, "ok1@example.com");
    seedSubscriber(db, "ok2@example.com");
    seedSubscriber(db, "bad@example.com");
    const reject = new Set(["bad@example.com"]);
    const env = campaignEnv(db, async (mail) => {
      if (reject.has(mail.to)) throw new Error("smtp down");
    });

    expect(await sendCampaign(env, CAMPAIGN_ID)).toEqual({
      ok: true,
      sent: 2,
      failed: 1,
    });
    expect(storedCampaign(db)).toMatchObject({
      status: "draft",
      sent_count: 2,
      failed_count: 1,
    });

    reject.clear();
    expect(await sendCampaign(env, CAMPAIGN_ID)).toEqual({
      ok: true,
      sent: 1,
      failed: 0,
    });
    expect(storedCampaign(db)).toMatchObject({
      status: "sent",
      sent_count: 3,
      failed_count: 0,
    });
  });

  it("adds to a legacy campaign's sent_count when retrying it", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    // A row the pre-accumulate code left marked sent: 100 delivered, 1 owed.
    seedCampaign(db, "sent", 1, 100);
    seedSubscriber(db, "ok@example.com");
    seedSubscriber(db, "bad@example.com");
    db.prepare(
      `INSERT INTO email_sends (campaign_id, email, sent_at, error)
       VALUES (?, 'ok@example.com', 1, NULL)`
    ).run(CAMPAIGN_ID);
    db.prepare(
      `INSERT INTO email_sends (campaign_id, email, sent_at, error)
       VALUES (?, 'bad@example.com', 1, 'email send failed')`
    ).run(CAMPAIGN_ID);

    const result = await sendCampaign(
      campaignEnv(db, async () => {}),
      CAMPAIGN_ID
    );
    expect(result).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(storedCampaign(db)).toMatchObject({
      status: "sent",
      sent_count: 101,
      failed_count: 0,
    });
  });

  it("returns 409 when the campaign is already sent", async () => {
    resetMailSchemaCache();
    const db = seedMailDb();
    seedCampaign(db, "sent", 0);
    const send = vi.fn(async () => {});
    const result = await sendCampaign(campaignEnv(db, send), CAMPAIGN_ID);
    expect(result).toEqual({ error: "campaign already sent", status: 409 });
    expect(send).not.toHaveBeenCalled();
    expect(storedCampaign(db)).toMatchObject({
      status: "sent",
      failed_count: 0,
    });
  });
});
