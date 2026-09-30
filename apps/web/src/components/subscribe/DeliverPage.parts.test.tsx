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
import { ChromeChannel } from "./ChromeChannel";
import { DigestPreview } from "./DigestPreview";
import { EmailChannel } from "./EmailChannel";
import { MailFormatField } from "./MailFormatField";
import { NewTabMock } from "./NewTabMock";
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
  it("switches its sample headlines with the language", () => {
    expect(renderToStaticMarkup(<NewTabMock lang="en" />)).toContain(
      "What&#x27;s new in AI today?"
    );
    expect(renderToStaticMarkup(<NewTabMock lang="vi" />)).toContain(
      "Hôm nay AI có gì mới?"
    );
  });
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
