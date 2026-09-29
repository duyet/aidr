/** @vitest-environment happy-dom */

import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANYROUTER_URL } from "../lib/site";
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
  fetchFeedFreshnessOnce: () => Promise.resolve(null),
}));

afterEach(cleanup);

function renderFooter() {
  return render(<NewsFooter />);
}

/** The `More` column, located by its heading rather than by position. */
function moreColumn() {
  const heading = screen.getByText("More");
  const column = heading.parentElement;
  if (!column) throw new Error("More column not found");
  return within(column);
}

describe("footer More column", () => {
  it("links to anyrouter.dev with the credited URL", () => {
    renderFooter();

    const link = moreColumn().getByRole("link", { name: "anyrouter.dev" });
    expect(link.getAttribute("href")).toBe(ANYROUTER_URL);
    // Partner link: must not leak the referrer or lose the referral.
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("keeps the existing author link alongside it", () => {
    renderFooter();

    const links = moreColumn().getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
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
