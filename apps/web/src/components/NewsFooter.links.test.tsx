/** @vitest-environment happy-dom */

import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { ANYROUTER_URL } from "../lib/site";
import type { Lang } from "../lib/types";
import { NewsFooter } from "./NewsFooter";

// The footer only renders inside the app shell; stub the router to plain
// anchors so the test can assert real hrefs.
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      children,
      to,
      ...props
    }: {
      children?: ReactNode;
      to?: string;
      [key: string]: unknown;
    }) => React.createElement("a", { ...props, href: to ?? "#" }, children),
  };
});

// Freshness is about the "Updated …" label, not the link column, and the real
// fetcher would reach the network from a DOM test.
vi.mock("../lib/feed-cache", () => ({
  getCachedFeedFreshness: () => null,
  getCachedLatestRun: () => undefined,
  fetchFeedFreshnessOnce: () => Promise.resolve(null),
}));

afterEach(cleanup);

function renderFooter(lang: Lang = "en") {
  return render(
    <LangContext.Provider value={lang}>
      <NewsFooter />
    </LangContext.Provider>
  );
}

function column(name: string) {
  const heading = screen.getByText(name);
  const node = heading.parentElement;
  if (!node) throw new Error(`${name} column not found`);
  return within(node);
}

describe("footer More column", () => {
  it("links to anyrouter.dev with the credited URL", () => {
    renderFooter();

    const link = column("More").getByRole("link", { name: "anyrouter.dev" });
    expect(link.getAttribute("href")).toBe(ANYROUTER_URL);
    // Partner link: must not leak the referrer or lose the referral.
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("keeps the existing author link alongside it", () => {
    renderFooter();

    const links = column("More").getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Contribute",
      "GitHub",
      "duyet.net",
      "anyrouter.dev",
    ]);
  });

  it("sends every surface to the same credited AnyRouter URL", () => {
    // The referral is a partner link: if one surface drops `?ref=aidr.today`
    // the attribution silently stops crediting. Pin the one definition.
    expect(ANYROUTER_URL).toBe("https://anyrouter.dev/?ref=aidr.today");
  });
});

describe("footer Site column", () => {
  it.each([
    ["vi", "Trang", ["Giới thiệu", "Phát hành", "Dữ liệu", "Quyền riêng tư"]],
    ["en", "Site", ["About", "Release", "Data", "Privacy"]],
  ] as const)("names the pages in %s", (lang, heading, names) => {
    renderFooter(lang);
    const site = column(heading);
    for (const name of names) {
      const link = site.getByRole("link", { name });
      expect(link.querySelector("svg")).not.toBeNull();
    }
    expect(
      screen.queryByRole("link", { name: /Brand|Thương hiệu/ })
    ).toBeNull();
  });
});

describe("footer Follow column", () => {
  it.each([
    ["vi", "Theo dõi", "https://t.me/aihomnay"],
    ["en", "Follow", "https://t.me/aidr_today"],
  ] as const)(
    "sends %s readers to their Telegram channel",
    (lang, heading, href) => {
      renderFooter(lang);
      expect(
        column(heading)
          .getByRole("link", { name: "Telegram" })
          .getAttribute("href")
      ).toBe(href);
    }
  );
});
