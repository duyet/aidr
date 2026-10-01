/**
 * The LCP element for aidr.today is the first story row in the AI;DR
 * section — `span.min-w-0.flex-1.line-clamp-2` in TldrBulletRow. Issue #229
 * measured a 2,420 ms element render delay against a 10 ms TTFB, so the
 * question that decides whether the page is fast is narrow and absolute:
 * does that row exist in the HTML the server sends, before any script runs?
 *
 * These tests render the component tree with React's server renderer, so a
 * pass means the markup is genuinely in the SSR output — not "the code path
 * looks like it would render it".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TldrBulletList } from "../components/TldrBulletList";
import { parseAidrLayout } from "../lib/aidr-layout";
import type { Lang, TldrBullet } from "../lib/types";

const ITEM_ID = "071a284c0011223344556677";
const TITLE_VI =
  "OpenAI và Anthropic điều tra hàng chục nghìn sự cố bảo mật nghiêm trọng";

const bullet: TldrBullet = {
  text: TITLE_VI,
  item_ids: [ITEM_ID],
  image_url: null,
};

function renderAidr(lang: Lang = "vi"): string {
  const shown = [bullet];
  return renderToStaticMarkup(
    <TldrBulletList
      shown={shown}
      mid={1}
      layout={parseAidrLayout(undefined)}
      numbered
      lang={lang}
      topicByItemId={new Map([[ITEM_ID, "openai"]])}
      categoryByItemId={new Map()}
      pathByItemId={new Map([[ITEM_ID, `/${ITEM_ID.slice(0, 8)}`]])}
      tagsByItemId={new Map([[ITEM_ID, ["openai"]]])}
    />
  );
}

describe("AI;DR LCP row renders without JavaScript", () => {
  const html = renderAidr();

  it("emits the LCP element's own class signature in the SSR markup", () => {
    // These four classes are what the browser measured the LCP against
    // (`li > a.group > span.flex > span.min-w-0`). If the markup changes,
    // the LCP element changes and the perf work is measuring something else.
    expect(html).toContain("min-w-0");
    expect(html).toContain("flex-1");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("break-words");
    expect(html).toMatch(
      /<span class="min-w-0 flex-1 line-clamp-2 break-words/
    );
  });

  it("puts the Vietnamese story text in the server-rendered row", () => {
    // The diacritics have to survive SSR: a latin-only font subset renders
    // this row in a system face and an English-only screenshot hides it.
    expect(html).toContain("điều tra");
    expect(html).toContain("nghiêm trọng");
    expect(html).toContain("OpenAI");
  });

  it("links the row to the story, so it is crawlable and clickable pre-hydration", () => {
    expect(html).toMatch(
      new RegExp(`<a href="/${ITEM_ID.slice(0, 8)}"[^>]*class="group block`)
    );
  });

  it("sets the full title attribute, so no JS is needed to read the row", () => {
    expect(html).toContain(`title="${TITLE_VI}"`);
  });

  it("does not gate the row behind a skeleton, a fetch or a hidden wrapper", () => {
    // The row itself must not be inside anything that withholds paint. The
    // only `hidden` allowed is the decorative thumb's own aria-hidden, which
    // is an accessibility attribute, not a visibility one.
    expect(html).not.toMatch(/class="[^"]*\bskeleton\b/);
    expect(html).not.toMatch(/\shidden(=|\s|>)/);
    expect(html).not.toMatch(/visibility:\s*hidden/);
    expect(html).not.toMatch(/opacity:\s*0(?!\.)/);
    expect(html).not.toMatch(/aria-busy/);
    // The <ol>/<li> wrapper is the real markup, not a client-only portal.
    expect(html).toMatch(/<ol start="1"/);
    expect(html).toMatch(/<li>/);
  });

  it("renders the same markup for the English locale", () => {
    const en = renderAidr("en");
    expect(en).toMatch(/<span class="min-w-0 flex-1 line-clamp-2 break-words/);
  });
});

describe("AI;DR card density", () => {
  // The reader Density pref sets --reader-pad / --reader-leading on the page;
  // the card must read them, or the slider changes the feed but not the card.
  it("spaces bullets from the reader density vars, not fixed values", () => {
    const html = renderAidr();
    expect(html).toContain("var(--reader-pad");
    expect(html).toContain("var(--reader-leading");
  });
});
