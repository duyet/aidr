/**
 * The LCP element for aidr.today is the first story row in the AI;DR
 * section — `span.line-clamp-2` in TldrBulletRow. Issue #229
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

function renderAidr(
  lang: Lang = "vi",
  extra: Partial<Parameters<typeof TldrBulletList>[0]> = {}
): string {
  const shown = [bullet];
  return renderToStaticMarkup(
    <TldrBulletList
      shown={shown}
      layout={parseAidrLayout(undefined)}
      numbered
      lang={lang}
      topicByItemId={new Map([[ITEM_ID, "openai"]])}
      categoryByItemId={new Map()}
      pathByItemId={new Map([[ITEM_ID, `/${ITEM_ID.slice(0, 8)}`]])}
      tagsByItemId={new Map([[ITEM_ID, ["openai"]]])}
      {...extra}
    />
  );
}

describe("AI;DR LCP row renders without JavaScript", () => {
  const html = renderAidr();

  it("emits the LCP element's own class signature in the SSR markup", () => {
    // The browser measured the LCP against the clamped title block
    // (`li > a.group > span.flex > span.min-w-0 > span.line-clamp-2`). If
    // the markup changes, the LCP element changes and the perf work is
    // measuring something else.
    expect(html).toContain("line-clamp-2");
    expect(html).toContain("break-words");
    expect(html).toMatch(
      /<span class="min-w-0 flex-1 text-\[15px\]"><span class="line-clamp-2 break-words/
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
    expect(html).toMatch(/<ol class="tldr-grid /);
    expect(html).toMatch(/<li class="border-b border-border"/);
  });

  it("renders the same markup for the English locale", () => {
    const en = renderAidr("en");
    expect(en).toMatch(/<span class="line-clamp-2 break-words/);
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

describe("AI;DR card columns", () => {
  // The columns pref reaches the list as --tldr-cols on an ancestor
  // (.app-shell). One ol keeps reading order row by row across columns.
  it("lays every story into one grid list that follows --tldr-cols", () => {
    const shown = ["a", "b", "c"].map((id) => ({
      text: `Story ${id}`,
      item_ids: [`${id}0011223344556677`],
    }));
    const html = renderToStaticMarkup(
      <TldrBulletList
        shown={shown}
        layout={parseAidrLayout(undefined)}
        numbered
        lang="en"
      />
    );
    expect(html.match(/<ol /g)).toHaveLength(1);
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toMatch(/<ol class="tldr-grid /);
    expect(html).not.toContain("--tldr-cols");
  });

  it("pins one column for a narrow slot whatever the pref says", () => {
    expect(renderAidr("en", { singleColumn: true })).toContain(
      'style="--tldr-cols:1"'
    );
  });
});

describe("AI;DR second language", () => {
  const TITLE_EN = "OpenAI and Anthropic investigate thousands of incidents";

  it("shows the other language's own title under the clamped one", () => {
    const html = renderAidr("vi", {
      secondTextByItemId: new Map([[ITEM_ID, TITLE_EN]]),
    });
    expect(html).toContain(TITLE_VI);
    // The clamp closes before the second line opens, so a two-line title
    // cannot cut it off.
    expect(html).toContain(
      `</span></span><span lang="en" class="bi-second block">${TITLE_EN}</span>`
    );
  });

  it("labels the second line with the language it is written in", () => {
    const html = renderAidr("en", {
      secondTextByItemId: new Map([[ITEM_ID, TITLE_VI]]),
    });
    expect(html).toContain(
      `<span lang="vi" class="bi-second block">${TITLE_VI}</span>`
    );
  });

  it("shows no second line for a story the other column does not have", () => {
    const html = renderAidr("vi", {
      secondTextByItemId: new Map([["someOtherItem", TITLE_EN]]),
    });
    expect(html).not.toContain("bi-second");
    expect(html).not.toContain(TITLE_EN);
  });

  it("shows no second line outside bilingual mode", () => {
    expect(renderAidr("vi")).not.toContain("bi-second");
  });
});
