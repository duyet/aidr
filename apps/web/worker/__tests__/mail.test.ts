import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { previewCampaign } from "../mail/campaigns.js";
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
} from "../mail/render.js";
import { digestFrom, notesFrom } from "../mail/send.js";
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
      cta: { label: "Read", url: "https://blog.duyet.net/x" },
      unsubscribeUrl: "https://aidr.today/subscribe?unsubscribe=tok",
      settingsUrl: "https://aidr.today/subscribe?settings=tok",
    });
    expect(html).toContain("max-width:540px");
    expect(html).toContain(`src="${MAIL_LOGO_URL}"`);
    expect(html).toContain('width="40"');
    expect(html).toContain('height="40"');
    expect(html).toContain('alt=""');
    expect(MAIL_LOGO_URL).toBe("https://aidr.today/logo-icon.png");
    expect(html).toContain("https://aidr.today/logo-icon.png");
    expect(html).not.toContain("/assets/logo");
    expect(html).toContain("padding:32px");
    expect(html).toContain("line-height:44px");
    expect(html).toContain("border-bottom:0 !important");
    expect(html).toContain("AI;DR");
    expect(html).toContain("AI news ranked and summary");
    expect(html).toContain("Inbox preview");
    expect(html).toContain("#b45309");
    expect(html).toContain("#fffefb !important");
    expect(html).toContain("text-decoration:none !important");
    expect(html).toContain("background-color:#b45309");
    expect(html).toContain("#f7f7f5");
    expect(html).toContain("#ffffff");
    expect(html).toContain("Georgia");
    expect(html).toContain("Inter");
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

describe("listUnsubscribeHeaders", () => {
  it("includes one-click POST and the page URL", () => {
    const headers = listUnsubscribeHeaders("abc");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toContain("/api/subscribe?token=abc");
    expect(headers["List-Unsubscribe"]).toContain("/subscribe?unsubscribe=abc");
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
