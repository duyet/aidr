/** @vitest-environment happy-dom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { PageViewTracker } from "./PageViewTracker";

const location = vi.hoisted(() => ({ pathname: "/", searchStr: "" }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (s: { location: typeof location }) => unknown;
  }) => select({ location }),
}));
vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

describe("PageViewTracker", () => {
  it("counts one landing when the language switch keeps the utm params", () => {
    location.pathname = "/";
    location.searchStr = "?utm_source=telegram";
    const { rerender } = render(<PageViewTracker />);

    // handleLangChange in __root.tsx re-navigates with the same search.
    location.searchStr = "?utm_source=telegram&lang=en";
    rerender(<PageViewTracker />);

    expect(vi.mocked(track).mock.calls).toEqual([
      [
        "channel_landing",
        { channel: "telegram", page_type: "home", page_path: "/" },
      ],
      ["page_view", { page_path: "/", page_type: "home" }],
      ["page_view", { page_path: "/", page_type: "home" }],
    ]);
  });
});
