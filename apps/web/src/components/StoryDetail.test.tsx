/**
 * StoryDetail shows one language, both stacked (VI+EN in Customize) or both
 * side by side (the dialog's toggle). Side by side wins over stacked, which
 * wins over one language, and each language reads from its own column.
 *
 * Server-rendered, like the other story markup tests.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { FeedItem, Lang } from "../lib/types";
import { StoryDetail } from "./StoryDetail";
import { DialogHeader } from "./story-dialog/DialogHeader";

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A faster model",
  title_vi: "Một model nhanh hơn",
  summary: "English summary.",
  summary_vi: "Bản tiếng Việt.",
  category: "Models",
  published_at: 1_700_000_000,
  points: 0,
  comments: 0,
  rank_score: 1,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
};

function withPrefs(prefs: Partial<Prefs>, ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <PrefsContext.Provider
      value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
    >
      {ui}
    </PrefsContext.Provider>
  );
}

const detail = (
  prefs: Partial<Prefs>,
  lang: Lang = "en",
  props: { bilingual?: boolean; item?: FeedItem } = {}
) =>
  withPrefs(
    prefs,
    <StoryDetail
      item={props.item ?? item}
      lang={lang}
      bilingual={props.bilingual}
    />
  );

const occurrences = (html: string, text: string) => html.split(text).length - 1;

describe("StoryDetail languages", () => {
  it("shows one language by default", () => {
    const html = detail({});
    expect(html).toContain("English summary.");
    expect(html).not.toContain("Bản tiếng Việt.");
    expect(html).not.toContain("bi-second");
  });

  it("stacks both, the leading language first and the other muted", () => {
    const html = detail({ bilingual: true, bilingualFirst: "vi" });
    expect(html.indexOf("Bản tiếng Việt.")).toBeLessThan(
      html.indexOf("English summary.")
    );
    expect(html).toMatch(/lang="en" class="[^"]*bi-second/);
    expect(html.match(/class="drop-cap"/g)).toHaveLength(1);
    expect(html).not.toContain("lg:grid-cols-2");
  });

  it("targets suggestions at the Vietnamese column when both show", () => {
    const html = detail({ bilingual: true, bilingualFirst: "en" });
    expect(html.match(/data-suggest-field="summary"/g)).toHaveLength(1);
    expect(html).toMatch(/data-suggest-field="summary" lang="vi"/);
  });

  it("lets the side-by-side toggle win over stacked mode, showing each text once", () => {
    const html = detail({ bilingual: true }, "en", { bilingual: true });
    expect(html).toContain("lg:grid-cols-2");
    expect(occurrences(html, "English summary.")).toBe(1);
    expect(occurrences(html, "Bản tiếng Việt.")).toBe(1);
    expect(html).not.toContain("bi-second");
  });

  it("ignores the side-by-side toggle when there is no Vietnamese text", () => {
    const html = detail({}, "en", {
      bilingual: true,
      item: { ...item, title_vi: null, summary_vi: null },
    });
    expect(html).not.toContain("lg:grid-cols-2");
    expect(html).toContain("English summary.");
  });

  it("never fills a missing Vietnamese summary from English when stacked", () => {
    const html = detail({ bilingual: true }, "vi", {
      item: { ...item, summary_vi: null },
    });
    expect(occurrences(html, "English summary.")).toBe(1);
    expect(html).not.toContain("bi-second");
  });
});

const header = (prefs: Partial<Prefs>, sideBySide = false) =>
  withPrefs(
    prefs,
    <DialogHeader
      item={item}
      title="A faster model"
      fallbackFromEnglish={false}
      hasVi
      bilingual={sideBySide}
      lang="en"
      onToggleBilingual={() => {}}
      onClose={() => {}}
      onStep={() => {}}
    />
  );

describe("DialogHeader", () => {
  it("shows the headline in one language, then stacked, then for the side-by-side view", () => {
    expect(header({})).not.toContain("Một model nhanh hơn");
    const stacked = header({ bilingual: true, bilingualFirst: "vi" });
    expect(stacked.indexOf("Một model nhanh hơn")).toBeLessThan(
      stacked.indexOf("A faster model")
    );
    expect(stacked).toMatch(/lang="en" class="bi-second/);
    const sideBySide = header({}, true);
    expect(sideBySide).toContain("Một model nhanh hơn");
    expect(sideBySide.indexOf("A faster model")).toBeLessThan(
      sideBySide.indexOf("Một model nhanh hơn")
    );
  });

  it("offers the side-by-side switch as a pressed-state button only with Vietnamese text", () => {
    const html = header({}, true);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Dual language/s);
    expect(html).toContain("Previous story");
    expect(html).toContain("Next story");
    const noVi = withPrefs(
      {},
      <DialogHeader
        item={item}
        title="A faster model"
        fallbackFromEnglish={false}
        hasVi={false}
        bilingual={false}
        lang="en"
        onToggleBilingual={() => {}}
        onClose={() => {}}
      />
    );
    expect(noVi).not.toContain("Dual language");
    expect(noVi).not.toContain("Next story");
  });

  it("opens the story page and the source as the two actions", () => {
    const html = header({});
    expect(html).toMatch(/class="btn-primary"[^>]*>.*Open page/s);
    expect(html).toMatch(
      /href="https:\/\/www\.example\.com\/post"[^>]*class="btn-link"/
    );
  });
});
