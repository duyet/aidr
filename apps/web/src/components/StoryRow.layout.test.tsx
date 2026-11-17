import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { FeedItem, Lang } from "../lib/types";
import { StoryRow } from "./StoryRow";

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "OpenAI ships a model",
  title_vi: "OpenAI ra mô hình",
  summary: "English summary",
  summary_vi: "Tóm tắt tiếng Việt",
  category: "Models",
  published_at: 1_700_000_000,
  points: 0,
  comments: 0,
  rank_score: 0,
  source_id: "hn",
  tags: ["OpenAI"],
  sources: [],
  llm_tokens: 0,
  image_url: "https://images.example.com/a.jpg",
};

function row(prefs: Partial<Prefs> = {}, lang: Lang = "en", it_ = item) {
  return renderToStaticMarkup(
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
      >
        <StoryRow item={it_} index={4} lang={lang} />
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

describe("row content", () => {
  it("shows the topic dot and name, the source and the time", () => {
    const html = row();
    expect(html).toContain("topic-dot");
    expect(html).toContain("Models");
    expect(html).toContain("example.com");
    expect(html).toMatch(/\d+(y|d|h|m)</);
  });

  it("clamps the title to two lines and matches the AI;DR card's title type", () => {
    const html = row();
    expect(html).toContain("line-clamp-2");
    // Same family (inherited Inter), size, weight and leading as the
    // numbered item titles in TldrBulletRow / TldrBulletList.
    expect(html).toContain("story-title block min-w-0 text-[15px]");
    expect(html).toContain("leading-[calc(var(--reader-leading,1.55)_-_0.175)]");
    expect(html).toContain("font-normal text-foreground");
  });

  it("colors key names with the topic ink", () => {
    expect(row()).toMatch(/class="topic-ink font-semibold"[^>]*>OpenAI</);
  });

  it("keeps the source link reachable without hover", () => {
    const html = row();
    expect(html).toContain("group-hover:opacity-100");
    expect(html).toContain("group-focus-within:opacity-100");
    expect(html).toContain("[@media(hover:none)]:opacity-100");
    expect(html).not.toMatch(/story-go[^"]*\bhidden\b/);
  });
});

describe("thumbnails", () => {
  it("renders one when the pref is on, sized by the layout variable", () => {
    const html = row({ thumbs: true });
    expect(html).toContain("row-thumb");
    expect(html).toContain("size-(--thumb-size)");
  });

  it("renders none when the pref is off, so nothing is fetched", () => {
    const html = row({ thumbs: false });
    expect(html).not.toContain("row-thumb");
    expect(html).not.toContain("<img");
  });

  it("renders none in the newspaper layout", () => {
    expect(row({ layout: "newspaper" })).not.toContain("row-thumb");
  });
});

describe("summaries", () => {
  it("are left out by default", () => {
    expect(row()).not.toContain("row-summary");
  });

  it("show under the title when the pref is on, from the reader's own column", () => {
    const html = row({ summaries: true }, "vi");
    expect(html).toContain("row-summary");
    expect(html).toContain("Tóm tắt tiếng Việt");
    expect(html).not.toContain("English summary");
  });

  it("show in the newspaper layout whatever the pref says", () => {
    const html = row({ layout: "newspaper", summaries: false });
    expect(html).toContain("English summary");
    expect(html).toContain("np-justify");
  });

  it("never borrow the other language when one column is empty", () => {
    const html = row({ summaries: true }, "vi", { ...item, summary_vi: null });
    expect(html).not.toContain("row-summary");
    expect(html).not.toContain("English summary");
  });
});

describe("bilingual", () => {
  const plain = (html: string) => html.replace(/<[^>]+>/g, "|");

  it("shows the leading title in full and the other under it, each in its language", () => {
    const html = row({ bilingual: true, bilingualFirst: "vi" }, "vi");
    expect(plain(html)).toContain("OpenAI|| ra mô hình");
    expect(html).toMatch(
      /lang="en" class="bi-second[^"]*">OpenAI ships a model</
    );
    expect(html.indexOf("ra mô hình")).toBeLessThan(
      html.indexOf("OpenAI ships a model")
    );
  });

  it("leaves out a second line the item has no text for", () => {
    const html = row({ bilingual: true, bilingualFirst: "vi" }, "vi", {
      ...item,
      title_vi: null,
    });
    expect(html).not.toContain("bi-second");
    expect(plain(html)).toContain("OpenAI|| ships a model");
  });
});

describe("rank and votes", () => {
  it("hides the rank number on a phone and in the newspaper", () => {
    const html = row();
    expect(html).toMatch(/story-rank[^"]*max-\[699px\]:hidden/);
    expect(html).toMatch(/story-rank[^"]*in-data-\[layout=newspaper\]:hidden/);
  });

  it("drops the vote cell when the page has no votes", () => {
    const withVotes = renderToStaticMarkup(
      <StoryRow item={item} index={1} lang="en" />
    );
    const without = renderToStaticMarkup(
      <StoryRow item={item} index={1} lang="en" showVotes={false} />
    );
    expect(withVotes).toContain("story-score");
    expect(without).not.toContain("story-score");
  });
});
