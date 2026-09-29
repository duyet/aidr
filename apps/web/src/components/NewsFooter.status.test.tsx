/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsFooter } from "./NewsFooter";

const now = Math.floor(Date.now() / 1000);

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      children,
      to,
      search,
      ...props
    }: {
      children?: ReactNode;
      to?: string;
      search?: Record<string, string>;
      [key: string]: unknown;
    }) =>
      React.createElement(
        "a",
        {
          ...props,
          href: `${to ?? "#"}${search ? `?${new URLSearchParams(search)}` : ""}`,
        },
        children
      ),
  };
});

vi.mock("../lib/feed-cache", () => ({
  getCachedFeedFreshness: () => now - 60,
  getCachedLatestRun: () => ({
    id: "run-42",
    startedAt: now - 600,
    finishedAt: now - 540,
    failed: true,
    degraded: false,
  }),
  fetchFeedFreshnessOnce: () => Promise.resolve(null),
}));

afterEach(cleanup);

describe("footer run status", () => {
  it("deep links 'Updated' to the latest run and labels its health", async () => {
    render(<NewsFooter />);
    const link = await screen.findByRole("link", { name: /Updated/ });
    expect(link.getAttribute("href")).toBe("/data?tab=runs&run=run-42");
    // A failed run is red and says so to screen readers, not only by color.
    const dot = screen.getByRole("img", { name: /Pipeline down/ });
    expect(dot.className).toContain("bg-red-500");
  });
});
