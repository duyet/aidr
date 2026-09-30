/**
 * The deliver page is split into one module per channel plus shared preview
 * pieces. These render each piece with React's server renderer so a pass
 * means the copy, links, and bilingual switch still reach the HTML — the
 * split must not drop a CTA or leave a tab rendering the wrong language.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CHROME_WEB_STORE_URL,
  TELEGRAM_EN_HANDLE,
  TELEGRAM_EN_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../../lib/site";
import { BrowserFrame } from "./BrowserFrame";
import { ChannelSplit } from "./ChannelSplit";
import { ChromeChannel } from "./ChromeChannel";
import { DigestPreview } from "./DigestPreview";
import { EmailChannel } from "./EmailChannel";
import { MailFormatField } from "./MailFormatField";
import { NEW_TAB_SAMPLE, NewTabMock } from "./NewTabMock";
import { SettingsPreview } from "./SettingsPreview";
import { TELEGRAM_FEATURES, TelegramChannel } from "./TelegramChannel";
import { TELEGRAM_DIGEST, TelegramPreview } from "./TelegramPreview";

describe("BrowserFrame", () => {
  it("shows the tab label, the address, and its children", () => {
    const html = renderToStaticMarkup(
      <BrowserFrame tab="New Tab" address="chrome://newtab">
        <p>inner</p>
      </BrowserFrame>
    );
    expect(html).toContain("New Tab");
    expect(html).toContain("chrome://newtab");
    expect(html).toContain("<p>inner</p>");
  });
});

describe("NewTabMock", () => {
  const en = renderToStaticMarkup(<NewTabMock lang="en" />);
  const vi = renderToStaticMarkup(<NewTabMock lang="vi" />);

  it("uses the extension's own copy in each language", () => {
    expect(en).toContain("What&#x27;s happening in AI today?");
    expect(en).toContain("Search AI news...");
    expect(en).toContain("Show more ↓");
    expect(vi).toContain("Hôm nay AI có gì mới?");
    expect(vi).toContain("Tất cả");
    expect(vi).toContain("Xu hướng");
    expect(vi).toContain("Xem thêm ↓");
  });

  // The preview promises the same result as the real new tab, so each part
  // of that page has to be present: losing one makes the preview misleading.
  it("shows every part of the real new tab", () => {
    for (const html of [en, vi]) {
      // Header controls: the closed menu button and the preferences button.
      expect(html).toContain("Get AI;DR");
      expect(html).toContain(">Aa<");
      expect(html).not.toContain("Telegram");
      // Card title, date and the 8 / 12 / 16 count control.
      expect(html).toContain(">AI;DR<");
      expect(html).toContain(NEW_TAB_SAMPLE.date);
      for (const n of NEW_TAB_SAMPLE.counts) expect(html).toContain(`>${n}<`);
      // Every story leads with its topic label, numbered across two columns.
      for (const s of NEW_TAB_SAMPLE.stories) {
        expect(html).toContain(`>${s.label}</span>`);
      }
      expect(html).toContain('start="5"');
    }
    expect(en).toContain("329 stories");
    expect(en).toContain("Updated 1m ago");
    expect(vi).toContain("329 tin");
    expect(vi).toContain("Cập nhật 1 phút trước");
  });

  it("stays decorative: hidden from assistive tech, nothing focusable", () => {
    // React hoists an image preload <link> ahead of the root element.
    expect(en).toMatch(/^(<link[^>]*>)?<div[^>]*aria-hidden="true"/);
    expect(en).not.toMatch(/<(a|button|input)\b/);
  });
});

describe("ChannelSplit", () => {
  // The point of the layout is that a control and its result are read side by
  // side. Assert the pairing structurally: two columns at `lg`, and the
  // controls first in the DOM — which is also the reading order on a phone,
  // where the columns stack.
  it("puts the controls in the left column and the preview in the right", () => {
    const html = renderToStaticMarkup(
      <ChannelSplit controls={<p>controls</p>} preview={<p>preview</p>} />
    );
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]");
    expect(html).toContain("lg:sticky lg:top-20");
    expect(html.indexOf("controls")).toBeLessThan(html.indexOf("preview"));
  });

  // Each channel's controls must render before its own preview, or the split
  // silently degrades to the old stacked page. Markers are chosen from each
  // channel's two halves: a control it owns, and its preview frame.
  for (const [name, control, preview] of [
    ["ChromeChannel", "Chrome Web Store", "chrome://newtab"],
    ["TelegramChannel", TELEGRAM_HANDLE, "AI news today"],
    ["EmailChannel", "digest-email", "/api/subscribe/preview"],
  ] as const) {
    it(`splits ${name}: controls first, then the preview`, () => {
      const html =
        name === "ChromeChannel"
          ? renderToStaticMarkup(<ChromeChannel lang="en" />)
          : name === "TelegramChannel"
            ? renderToStaticMarkup(<TelegramChannel lang="en" />)
            : renderToStaticMarkup(<EmailChannel lang="en" />);
      expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]");
      expect(html.indexOf(control)).toBeGreaterThan(-1);
      expect(html.indexOf(preview)).toBeGreaterThan(-1);
      expect(html.indexOf(control)).toBeLessThan(html.indexOf(preview));
    });
  }
});

describe("ChromeChannel", () => {
  it("links to the Chrome Web Store and frames the new-tab mock", () => {
    const html = renderToStaticMarkup(<ChromeChannel lang="en" />);
    expect(html).toContain(`href="${CHROME_WEB_STORE_URL}"`);
    expect(html).toContain("chrome://newtab");
    expect(html).toContain("Updates");
  });
});

describe("TelegramChannel", () => {
  it("links to the channel and lists every feature in the chosen language", () => {
    const html = renderToStaticMarkup(<TelegramChannel lang="vi" />);
    expect(html).toContain(`href="${TELEGRAM_URL}"`);
    expect(html).toContain(`href="${TELEGRAM_EN_URL}"`);
    expect(html).toContain(`Mở ${TELEGRAM_HANDLE}`);
    expect(html).toContain(`Mở ${TELEGRAM_EN_HANDLE}`);
    for (const b of TELEGRAM_DIGEST.vi.bullets) expect(html).toContain(b);
    for (const b of TELEGRAM_DIGEST.en.bullets) expect(html).toContain(b);
    // Card matching the page language comes first.
    expect(html.indexOf(TELEGRAM_URL)).toBeLessThan(
      html.indexOf(TELEGRAM_EN_URL)
    );
    const en = renderToStaticMarkup(<TelegramChannel lang="en" />);
    expect(en.indexOf(TELEGRAM_EN_URL)).toBeLessThan(en.indexOf(TELEGRAM_URL));
    for (const f of TELEGRAM_FEATURES) expect(html).toContain(f.vi);
  });
});

describe("TelegramPreview", () => {
  it("renders the digest and trending post copy for the language", () => {
    const html = renderToStaticMarkup(
      <TelegramPreview lang="en" channel="en" />
    );
    for (const b of TELEGRAM_DIGEST.en.bullets) expect(html).toContain(b);
    expect(html).toContain(TELEGRAM_DIGEST.en.story.title);
  });
});

describe("DigestPreview", () => {
  it("loads the given preview with the chrome in the page language", () => {
    const html = renderToStaticMarkup(
      <DigestPreview lang="vi" src="/api/subscribe/preview?lang=en&n=3" />
    );
    expect(html).toContain('src="/api/subscribe/preview?lang=en&amp;n=3"');
    expect(html).toContain("Hộp thư — AI;DR");
    // Pending state is visible and the frame respects reduced motion.
    expect(html).toContain("Đang tải bản xem trước");
    expect(html).toContain("motion-reduce:transition-none");
    // The subject is short by design; it must never be clipped with "…".
    expect(html).not.toContain('truncate">AI;DR<');
  });
});

describe("EmailChannel", () => {
  it("previews the same settings the form starts with", () => {
    const html = renderToStaticMarkup(<EmailChannel lang="vi" />);
    expect(html).toContain(
      'src="/api/subscribe/preview?lang=vi&amp;n=5&amp;format=design"'
    );
    expect(html).toContain('name="digest-format"');
  });
});

describe("MailFormatField", () => {
  it("offers every layout in both languages and checks the current one", () => {
    const render = (lang: "en" | "vi") =>
      renderToStaticMarkup(
        <MailFormatField
          lang={lang}
          name="f"
          value="large"
          onChange={() => {}}
        />
      );
    const en = render("en");
    for (const label of [
      "No images",
      "Thumbnails",
      "Large images",
      "Plain text",
    ]) {
      expect(en).toContain(label);
    }
    expect(en.match(/checked=""/g)?.length).toBe(1);
    expect(en).toMatch(/checked=""\/>Large images/);
    const vi = render("vi");
    for (const label of ["Không hình", "Hình nhỏ", "Hình lớn", "Chỉ chữ"]) {
      expect(vi).toContain(label);
    }
    expect(vi).not.toContain("Thumbnails");
  });
});

describe("SettingsPreview", () => {
  const src = "/api/subscribe/preview?lang=en&n=5&format=design";

  it("shows a pending state and keeps the reserved frame size", () => {
    const html = renderToStaticMarkup(<SettingsPreview lang="en" src={src} />);
    expect(html).toContain("Loading preview");
    expect(html).toContain("h-96");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("uses the reader's language for the pending text", () => {
    const html = renderToStaticMarkup(<SettingsPreview lang="vi" src={src} />);
    expect(html).toContain("Đang tải bản xem trước");
  });
});
