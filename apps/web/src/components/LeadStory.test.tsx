/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordRead } from "../lib/analytics/reads";
import { track } from "../lib/analytics/track";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { FeedItem, Lang } from "../lib/types";
import { LeadStory } from "./LeadStory";

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("../lib/analytics/reads", () => ({ recordRead: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
  vi.mocked(recordRead).mockClear();
});

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "Congress advances chip export bills",
  title_vi: "Quốc hội thúc đẩy dự luật xuất khẩu chip",
  summary: "Four bills target Nvidia sales.",
  summary_vi: "Bốn dự luật nhắm vào việc Nvidia bán chip.",
  category: "Regulation",
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

function lead(lang: Lang, prefs: Partial<Prefs> = {}, it_: FeedItem = item) {
  return render(
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
      >
        <LeadStory item={it_} lang={lang} />
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

describe("LeadStory", () => {
  it("shows the headline, two lines of summary and the topic", () => {
    lead("en");
    expect(
      screen.getByRole("heading", {
        name: "Congress advances chip export bills",
      })
    ).toBeTruthy();
    expect(screen.getByText("Four bills target Nvidia sales.")).toBeTruthy();
    expect(screen.getByText("Regulation")).toBeTruthy();
  });

  it("links Read more to the story page and the source to the publisher", () => {
    lead("en");
    expect(
      screen.getByRole("link", { name: /Read more/ }).getAttribute("href")
    ).toBe("/abcdef12?lang=en");
    const source = screen.getByRole("link", { name: /Read source/ });
    expect(source.getAttribute("href")).toBe(item.url);
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("example.com")).toBeTruthy();
  });

  it("counts a click on the source as a source click and an outbound read", () => {
    lead("en");
    fireEvent.click(screen.getByRole("link", { name: /Read source/ }));
    expect(track).toHaveBeenCalledWith("source_click", {
      item_id: item.id,
      placement: "row",
    });
    expect(recordRead).toHaveBeenCalledWith(item.id, "outbound");
  });

  it("drops the source link and host when the story has no valid URL", () => {
    lead("en", {}, { ...item, url: "" });
    expect(screen.queryByRole("link", { name: /Read source/ })).toBeNull();
    expect(screen.queryByText("example.com")).toBeNull();
  });

  it("reads the Vietnamese columns in Vietnamese", () => {
    lead("vi");
    expect(
      screen.getByRole("heading", {
        name: "Quốc hội thúc đẩy dự luật xuất khẩu chip",
      })
    ).toBeTruthy();
    expect(
      screen.getByText("Bốn dự luật nhắm vào việc Nvidia bán chip.")
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Đọc tiếp/ })).toBeTruthy();
    expect(screen.queryByText("Four bills target Nvidia sales.")).toBeNull();
  });

  it("shows a missing summary as nothing, never the other language", () => {
    lead("vi", {}, { ...item, summary_vi: null });
    expect(screen.queryByText("Four bills target Nvidia sales.")).toBeNull();
  });

  it("shows both languages when bilingual, each from its own column", () => {
    lead("vi", { bilingual: true, bilingualFirst: "vi" });
    const second = screen.getByText("Congress advances chip export bills");
    expect(second.getAttribute("lang")).toBe("en");
    expect(second.className).toContain("bi-second");
    expect(screen.getByText("Four bills target Nvidia sales.")).toBeTruthy();
    expect(
      screen.getByText("Bốn dự luật nhắm vào việc Nvidia bán chip.")
    ).toBeTruthy();
  });
});
