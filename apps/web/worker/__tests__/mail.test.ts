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
import { previewCampaign, sendCampaign } from "../mail/campaigns.js";
import { parseWrapJson } from "../mail/compose.js";
import { parseRssItems } from "../mail/content.js";
import { markdownToEmailHtml, markdownToPlainText } from "../mail/markdown.js";
import {
  type DigestStory,
  digestSubjectLine,
  formatMailDate,
  headlineOverlap,
  listUnsubscribeHeaders,
  MAIL_LOGO_URL,
  mailCategoryLabel,
  NEWS_FROM,
  NOTES_FROM,
  renderDigestEmail,
  renderNoteEmail,
  SUBJECT_TARGET,
  SUMMARY_OVERLAP_MAX,
  storySummary,
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

const UNSUB = "https://aidr.today/subscribe?unsubscribe=tok";
const SETTINGS = "https://aidr.today/subscribe?settings=tok";

function story(n: number, extra: Partial<DigestStory> = {}): DigestStory {
  return {
    text: `Company ${n} shipped model ${n} to every user today. The launch shows how fast the field moves.`,
    url: `https://aidr.today/story-${n}`,
    imageUrl: `https://cdn.example.com/photo-${n}.jpg`,
    headline: `Company ${n} ships model ${n}`,
    source: `news${n}.example.com`,
    category: n % 2 ? "Models" : "Agents",
    ...extra,
  };
}

function digest(
  over: Partial<Parameters<typeof renderDigestEmail>[0]> = {}
): ReturnType<typeof renderDigestEmail> {
  return renderDigestEmail({
    date: "2026-10-10",
    lang: "en",
    stories: [1, 2, 3, 4, 5].map((n) => story(n)),
    unsubscribeUrl: UNSUB,
    settingsUrl: SETTINGS,
    ...over,
  });
}

const VIDEO = { youtubeId: "R3j93-pO9ac", title: null };

describe("renderNoteEmail", () => {
  it("shares the 600px shell, wordmark, CTA and footer with the digest", () => {
    const { html, text } = renderNoteEmail({
      subject: "A note",
      preheader: "Inbox preview",
      bodyMd: "Hello **friend**.",
      lang: "en",
      cta: { label: "Read", url: "https://blog.duyet.net/x" },
      unsubscribeUrl: UNSUB,
      settingsUrl: SETTINGS,
    });
    expect(html).toContain("max-width:600px");
    expect(html).toContain(">AI;DR</span>");
    expect(html).toContain("AI news, ranked and summarized");
    expect(html).toContain("<strong>friend</strong>");
    expect(html).toContain(">Read</font>");
    expect(html).toContain("v:roundrect");
    expect(html).toContain("Inbox preview&zwnj;&nbsp;");
    expect(html).toContain("unsubscribe=tok&amp;lang=en");
    expect(text).toContain("Read: https://blog.duyet.net/x");
    expect(text).toContain(
      "Unsubscribe: https://aidr.today/subscribe?unsubscribe=tok&lang=en"
    );
    // A note has no day page: no date line, no "View in browser".
    expect(html).not.toContain("View in browser");
    expect(html).not.toContain("min read");
  });

  it("uses the Vietnamese tagline and footer labels", () => {
    const { html } = renderNoteEmail({
      subject: "Chào",
      bodyMd: "Xin chào.",
      lang: "vi",
      unsubscribeUrl: UNSUB,
      settingsUrl: SETTINGS,
    });
    expect(html).toContain("Tin AI, xếp hạng và tóm tắt");
    expect(html).toContain(">Hủy đăng ký</a>");
    expect(html).toContain(">Cài đặt</a>");
    expect(html).toContain('lang="vi"');
  });

  it("prints the postal address only when one is set", () => {
    const base = {
      subject: "S",
      bodyMd: "B",
      lang: "en" as const,
      unsubscribeUrl: UNSUB,
      settingsUrl: SETTINGS,
    };
    expect(renderNoteEmail(base).html).not.toContain("AI;DR · ");
    const { html, text } = renderNoteEmail({
      ...base,
      postalAddress: "1 Main St, Springfield",
    });
    expect(html).toContain("AI;DR · 1 Main St, Springfield");
    expect(text).toContain("AI;DR · 1 Main St, Springfield");
  });
});

describe("digestSubjectLine", () => {
  it("leads with two whole headlines and the rest as +N more when they fit", () => {
    expect(
      digestSubjectLine(
        "2026-10-10",
        "en",
        ["TypeSafe raises $870M", "AI sends police a false tip"],
        7
      )
    ).toBe("TypeSafe raises $870M, AI sends police a false tip + 5 more");
  });

  it("falls back to one headline cut at a word when two do not fit", () => {
    const subject = digestSubjectLine(
      "2026-10-10",
      "en",
      [
        "Jev developer TypeSafe AI raised about $870M led by a16z at a $7.5B valuation",
        "An Anthropic model sent Philadelphia police a false homicide tip",
      ],
      5
    );
    expect(subject.endsWith("… + 4 more")).toBe(true);
    expect(subject.length).toBeLessThanOrEqual(SUBJECT_TARGET);
    expect(subject).not.toContain("Anthropic");
    expect(subject).not.toMatch(/\s…/);
  });

  it("is localized and keeps the fixed title when there are no headlines", () => {
    expect(
      digestSubjectLine("2026-10-10", "vi", ["Tin một", "Tin hai"], 5)
    ).toBe("Tin một, Tin hai + 3 tin");
    expect(digestSubjectLine("2026-10-10", "en")).toBe(
      "AI;DR — 2026-10-10 · Today in AI"
    );
  });
});

describe("formatMailDate", () => {
  it("spells the date out per language", () => {
    expect(formatMailDate("2026-10-10", "en")).toBe(
      "Saturday, October 10, 2026"
    );
    expect(formatMailDate("2026-10-10", "vi")).toBe(
      "Thứ Bảy, 10 tháng 10, 2026"
    );
    expect(formatMailDate("not-a-date", "en")).toBe("not-a-date");
  });
});

describe("renderDigestEmail", () => {
  it("EN with video: header, video, lead, rows, one CTA, channels, footer in order", () => {
    const { html, subject } = digest({ video: VIDEO, totalStories: 8 });
    const order = [
      ">AI;DR</span>",
      "Saturday, October 10, 2026",
      "5 stories · 1 min read",
      ">Đọc bằng Tiếng Việt</a>",
      "Watch the daily brief",
      "Lead story",
      "Company 1 ships model 1</span>",
      "Also today",
      "Company 5 ships model 5",
      "See all 8 stories on aidr.today",
      "t.me/aidr_today",
      "View in browser",
    ].map((needle) => html.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(`<title>${subject}</title>`);
    expect(subject).toContain("Company 1 ships model 1");
  });

  it("links the video thumbnail to youtu.be with UTM, in its own language only", () => {
    const { html, text } = digest({ video: VIDEO });
    expect(html).toContain("https://i.ytimg.com/vi/R3j93-pO9ac/hqdefault.jpg");
    expect(html).toContain(
      "https://youtu.be/R3j93-pO9ac?utm_source=email&amp;utm_medium=digest&amp;utm_campaign=digest&amp;utm_content=video"
    );
    expect(html).toContain("&#9654;");
    expect(text).toContain(
      "Watch the daily brief: https://youtu.be/R3j93-pO9ac?"
    );
  });

  it("omits the video block when the day has no video", () => {
    const { html, text } = digest({ video: null });
    expect(html).not.toContain("i.ytimg.com");
    expect(html).not.toContain("Watch the daily brief");
    expect(text).not.toContain("youtu.be");
    expect(html).not.toContain("plus the video brief");
  });

  it("VI: localized header, labels, channel and no English copy", () => {
    const { html, subject } = digest({
      lang: "vi",
      video: VIDEO,
      stories: [1, 2, 3].map((n) =>
        story(n, { headline: `Tin số ${n} về AI` })
      ),
    });
    expect(html).toContain('lang="vi"');
    expect(html).toContain("Thứ Bảy, 10 tháng 10, 2026");
    expect(html).toContain("3 tin · 1 phút đọc");
    expect(html).toContain(">Read in English</a>");
    expect(html).toContain("Xem bản tin video");
    expect(html).toContain("Tin chính");
    expect(html).toContain("Tin khác hôm nay");
    expect(html).toContain("Xem tất cả tin trên aidr.today");
    expect(html).toContain("t.me/aihomnay");
    expect(html).not.toContain("t.me/aidr_today");
    expect(html).toContain(">Xem trên web</a>");
    expect(html).not.toContain("Lead story");
    expect(html).not.toContain("See all");
    expect(subject).toBe("Tin số 1 về AI, Tin số 2 về AI + 1 tin");
  });

  it("shows category · source, the headline and one sentence per row, with no Read more links", () => {
    const { html } = digest();
    expect(html).toContain(">news2.example.com</span>");
    expect(html).toContain(">Agents</span>");
    expect(html).toContain(">Company 2 ships model 2</font>");
    expect(html).toContain(
      "Company 2 shipped model 2 to every user today.</div>"
    );
    expect(html).not.toContain(
      "The launch shows how fast the field moves.</div>\n            </td>"
    );
    expect(html).not.toContain("Read more");
    expect(html.match(/class="mail-cta"/g)?.length).toBe(1);
  });

  it("uses the bullet's first sentence as the headline when no title is stored", () => {
    const { html } = digest({
      stories: [story(1), story(2, { headline: undefined })],
    });
    expect(html).toContain(
      ">Company 2 shipped model 2 to every user today.</font>"
    );
    expect(html).toContain("The launch shows how fast the field moves.</div>");
  });

  it("skips a first sentence that only restates the headline", () => {
    const restated = {
      text: "An Anthropic AI model sent a false homicide tip to Philadelphia police. The company found out two months later.",
      headline:
        "An Anthropic AI model sent a false homicide tip to Philadelphia police",
    };
    expect(headlineOverlap(restated.headline, restated.text)).toBeGreaterThan(
      SUMMARY_OVERLAP_MAX
    );
    expect(storySummary(restated)).toBe(
      "The company found out two months later."
    );
    // Nothing new to say: no summary rather than the headline twice.
    expect(
      storySummary({
        text: "Microsoft launches Decision-1 to beat LLM latency.",
        headline: "Microsoft Launches Decision-1 Model to Beat LLM Latency",
      })
    ).toBe("");
    // A first sentence with new facts stays.
    expect(
      storySummary({
        text: "a16z led the round with Sequoia in. Investors bet on non-text models.",
        headline: "TypeSafe AI raises $870M",
      })
    ).toBe("a16z led the round with Sequoia in.");
    const { html } = digest({ stories: [story(1), story(2, restated)] });
    expect(html).not.toContain("Philadelphia police.</div>");
    expect(html).toContain("The company found out two months later.</div>");
  });

  it("labels categories in Vietnamese for the Vietnamese mail only", () => {
    const vi = digest({
      lang: "vi",
      stories: [
        story(1, { category: "Funding" }),
        story(2, { category: "Research" }),
      ],
    }).html;
    expect(vi).toContain(">Gọi vốn</span>");
    expect(vi).toContain(">Nghiên cứu</span>");
    expect(vi).not.toContain(">Funding</span>");
    expect(
      digest({ stories: [story(1, { category: "Funding" })] }).html
    ).toContain(">Funding</span>");
    expect(mailCategoryLabel("Something New", "vi")).toBe("Something New");
  });

  it("makes a failed image a quiet grey box and crops tall lead photos", () => {
    const { html } = digest();
    expect(html).toMatch(
      /<img [^>]*alt="Company 2 ships model 2"[^>]*font-size:11px;line-height:1.35;color:#6b6a64/
    );
    expect(html).toMatch(
      /class="m-thumb"[\s\S]{0,400}background-color:#ece9e1/
    );
    expect(html).toMatch(
      /max-height:300px;overflow:hidden[^>]*>\s*<img class="mail-lead-image"/
    );
  });

  it("stacks the header date under the wordmark on phones", () => {
    const { html } = digest();
    expect(html).toContain(
      ".m-block { display: block !important; width: 100% !important; text-align: left !important;"
    );
    expect(html.match(/<td class="m-block/g)?.length).toBe(2);
  });

  it("tags each link with its position", () => {
    const { html } = digest({ video: VIDEO });
    for (const content of [
      "lead",
      "s2",
      "s5",
      "cta",
      "video",
      "channel-telegram",
      "channel-youtube",
      "channel-chrome",
      "view-in-browser",
      "lang-switch",
    ]) {
      expect(html).toContain(`utm_content=${content}`);
    }
  });

  it("gives every story image its headline as alt text", () => {
    const { html } = digest();
    expect(html).toContain('alt="Company 1 ships model 1"');
    expect(html).toContain('alt="Company 3 ships model 3"');
    expect(html).not.toContain('alt=""');
  });

  it("has dark mode, a mobile rule and no 8-digit hex colours", () => {
    const { html } = digest({ video: VIDEO });
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain(
      '<meta name="supported-color-schemes" content="light dark">'
    );
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("@media only screen and (max-width: 480px)");
    expect(html).not.toMatch(/#[0-9a-fA-F]{8}\b/);
    expect(html).toContain("background-color:#f5c518");
  });

  it("keeps the font stacks free of double quotes and loads the webfonts", () => {
    const { html } = digest();
    expect(html).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond'
    );
    expect(html).not.toMatch(/font-family:[^;>]*"[^>]*['\w]/);
    expect(html).not.toContain("&quot;");
    expect(html).toContain("'Source Sans 3', -apple-system");
    expect(html).toContain("font-family:'EB Garamond'");
  });

  it("writes a padded preheader instead of story 1's text", () => {
    const { html } = digest({ video: VIDEO });
    expect(html).toContain(
      "Saturday's 5 AI stories in 1 minute, plus the video brief. Headline, source and one line each.&zwnj;&nbsp;"
    );
  });

  it("prints the postal address only when set", () => {
    expect(digest().html).not.toContain("AI;DR · ");
    expect(digest({ postalAddress: "PO Box 1" }).html).toContain(
      "AI;DR · PO Box 1"
    );
  });

  it("lists headline and URL per story in the plain-text part", () => {
    const { text } = digest();
    expect(
      text.startsWith(
        "AI;DR — Saturday, October 10, 2026\n5 stories · 1 min read"
      )
    ).toBe(true);
    expect(text).toContain(
      "2. Company 2 ships model 2\n   Company 2 shipped model 2 to every user today.\n   https://aidr.today/story-2?"
    );
    expect(text).toContain("utm_content=s2");
    expect(text).toContain(
      "View in browser: https://aidr.today/date/2026-10-10?"
    );
  });

  it("stays under Gmail's 102 KB clip with ten stories in the largest layout", () => {
    const { html } = digest({
      format: "large",
      video: VIDEO,
      postalAddress: "PO Box 1",
      stories: Array.from({ length: 10 }, (_, i) => story(i + 1)),
    });
    expect(new TextEncoder().encode(html).length).toBeLessThan(100 * 1024);
  });

  describe("formats", () => {
    const imageCount = (html: string) =>
      html.match(/cdn\.example\.com\/photo-/g)?.length ?? 0;

    it("design: lead image plus an 84px thumbnail per row", () => {
      const { html } = digest({ format: "design" });
      expect(html.match(/class="mail-lead-image"/g)?.length).toBe(1);
      expect(html.match(/class="m-thumb"/g)?.length).toBe(4);
      expect(imageCount(html)).toBe(5);
    });

    it("large: lead image plus a full-width image per row", () => {
      const { html } = digest({ format: "large" });
      expect(html.match(/class="mail-lead-image"/g)?.length).toBe(1);
      expect(html.match(/class="mail-large"/g)?.length).toBe(4);
      expect(html).not.toContain("m-thumb");
    });

    it("no-images: same layout without any story or video image", () => {
      const { html } = digest({ format: "no-images", video: VIDEO });
      expect(imageCount(html)).toBe(0);
      expect(html).not.toContain("i.ytimg.com");
      expect(html).toContain("Watch the daily brief");
      expect(html).toContain("Lead story");
      expect(html).toContain("See all stories on aidr.today");
    });

    it("text: the plain-text body, no story markup", () => {
      const { html, text } = digest({ format: "text" });
      expect(imageCount(html)).toBe(0);
      expect(html).toContain("white-space:pre-wrap");
      expect(html).not.toContain("Lead story");
      expect(text).toContain("1. Company 1 ships model 1");
    });

    it("lead never uses a generated OG card as its large image", () => {
      const { html } = digest({
        stories: [
          story(1, { imageUrl: "https://aidr.today/api/og/abc.png" }),
          story(2),
        ],
      });
      expect(html).not.toContain("mail-lead-image");
    });

    it("drops non-http(s) image urls", () => {
      const { html } = digest({
        stories: [story(1), story(2, { imageUrl: "javascript:alert(1)" })],
      });
      expect(html).not.toContain("javascript:");
    });
  });

  it("escapes story text", () => {
    const { html } = digest({
      stories: [
        story(1, { headline: "<b>x</b>", text: "<script>y</script>. Two." }),
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("normalizes stored layouts and defaults to design", () => {
    expect(normalizeMailFormat("large")).toBe("large");
    expect(normalizeMailFormat("bogus")).toBe("design");
    expect(MAIL_FORMATS).toContain("no-images");
    expect(mailFormatHasImages("design")).toBe(true);
    expect(mailFormatHasImages("text")).toBe(false);
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
      from: { email: "digest@aidr.today", name: "AI;DR" },
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
