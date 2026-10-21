/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { LangContext } from "../../lib/lang-context";
import { DeliverPage } from "./DeliverPage";
import { RssChannel } from "./RssChannel";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("./ChannelSplit", () => ({
  ChannelSplit: ({ controls }: { controls: ReactNode }) => controls,
}));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ children, to }: { children?: ReactNode; to?: string }) =>
      React.createElement("a", { href: to ?? "#" }, children),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const EN_FEED = "https://aidr.today/feed.xml?lang=en";
const VI_FEED = "https://aidr.today/feed.xml?lang=vi";

function subscribedFeed(href: string): string {
  if (href.startsWith("feed:")) return href.slice("feed:".length);
  const url = new URL(href);
  if (url.hostname === "feedly.com") {
    return decodeURIComponent(url.pathname.split("/feed%2F")[1] ?? "");
  }
  return url.searchParams.get("add_feed") ?? url.searchParams.get("url") ?? "";
}

function readerLinks(): HTMLAnchorElement[] {
  return [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
}

describe("RSS subscribe tab", () => {
  it("is a tab of the subscribe page, selectable as ?tab=rss", () => {
    render(
      <LangContext.Provider value="en">
        <DeliverPage tab="rss" onTabChange={() => {}} />
      </LangContext.Provider>
    );
    expect(
      screen.getByRole("tab", { name: "RSS", selected: true })
    ).toBeTruthy();
    expect(screen.getByText(EN_FEED)).toBeTruthy();
  });

  it.each([
    ["en", [EN_FEED, VI_FEED]],
    ["vi", [VI_FEED, EN_FEED]],
  ] as const)("lists the %s reader's own feed first", (lang, order) => {
    render(<RssChannel lang={lang} />);
    const shown = [...document.querySelectorAll("code")].map(
      (node) => node.textContent
    );
    expect(shown).toEqual(order);
  });

  it("hands every reader the exact feed URL, lang query included", () => {
    render(<RssChannel lang="en" />);
    const links = readerLinks();
    const hosts = links.map((link) =>
      link.href.startsWith("feed:") ? "feed:" : new URL(link.href).hostname
    );
    expect(hosts).toEqual([
      "feedly.com",
      "www.inoreader.com",
      "www.newsblur.com",
      "feed:",
      "feedly.com",
      "www.inoreader.com",
      "www.newsblur.com",
      "feed:",
    ]);
    expect(links.map((link) => subscribedFeed(link.href))).toEqual([
      ...Array(4).fill(EN_FEED),
      ...Array(4).fill(VI_FEED),
    ]);
  });

  it("reports copy and open-in clicks with the feed's language", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<RssChannel lang="vi" />);
    fireEvent.click(screen.getByRole("button", { name: /tiếng anh/i }));
    fireEvent.click(screen.getAllByRole("link", { name: "Feedly" })[0]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(EN_FEED));
    expect(vi.mocked(track).mock.calls).toEqual([
      ["rss_subscribe", { target: "copy", lang: "en" }],
      ["rss_subscribe", { target: "feedly", lang: "vi" }],
    ]);
  });
});
