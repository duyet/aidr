/**
 * The deliver page is split into one module per channel plus shared preview
 * pieces. These render each piece with React's server renderer so a pass
 * means the copy, links, and bilingual switch still reach the HTML — the
 * split must not drop a CTA or leave a tab rendering the wrong language.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHROME_WEB_STORE_URL, TELEGRAM_URL } from "../../lib/site";
import { BrowserFrame } from "./BrowserFrame";
import { ChromeChannel } from "./ChromeChannel";
import { DigestPreview } from "./DigestPreview";
import { NewTabMock } from "./NewTabMock";
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
    for (const f of TELEGRAM_FEATURES) expect(html).toContain(f.vi);
  });
});

describe("TelegramPreview", () => {
  it("renders the digest and trending post copy for the language", () => {
    const html = renderToStaticMarkup(<TelegramPreview lang="en" />);
    for (const b of TELEGRAM_DIGEST.en.bullets) expect(html).toContain(b);
    expect(html).toContain(TELEGRAM_DIGEST.en.story.title);
  });
});

describe("DigestPreview", () => {
  it("loads the live preview for the chosen language", () => {
    const html = renderToStaticMarkup(<DigestPreview lang="vi" />);
    expect(html).toContain('src="/api/subscribe/preview?lang=vi"');
    expect(html).toContain("Hộp thư — AI;DR");
    // Pending state is visible and the frame respects reduced motion.
    expect(html).toContain("Đang tải bản xem trước");
    expect(html).toContain("motion-reduce:transition-none");
  });
});
