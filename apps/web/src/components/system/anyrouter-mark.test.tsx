/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlgoTab } from "./AlgoTab";
import { AttributionView } from "./ModelAttribution";

// `TabsContent` only mounts inside a `Tabs` root; the two cards are what this
// file is about, so unwrap them.
vi.mock("@aidr/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aidr/ui")>()),
  TabsContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

// The Ranking card on the same tab fetches its own chains; a pending state
// keeps this file about the AnyRouter surfaces and skips the chart libs.
vi.mock("../../lib/use-system-stats", () => ({
  useSystemData: () => ({ data: null, error: null, loading: true }),
}));

/** The AnyRouter monogram, identified by its brand viewBox. */
const MARK_VIEWBOX = "203.66 206.57 801.34 801.34";

function marks(root: HTMLElement | Document = document): SVGSVGElement[] {
  return Array.from(
    root.querySelectorAll<SVGSVGElement>(`svg[viewBox="${MARK_VIEWBOX}"]`)
  );
}

afterEach(cleanup);

const models = {
  scoring: ["typesafe/jev", "anyrouter/auto"],
  translation: ["google/gemini-3.5-flash"],
  tldr: ["anyrouter/auto"],
  decisions: [],
};

describe("AnyRouter mark", () => {
  it("sits beside the attribution strip heading", () => {
    const { container } = render(<AttributionView models={models} />);

    const region = screen.getByRole("region", { name: "Powered by AnyRouter" });
    const [mark] = marks(region);
    expect(mark, "the strip heading should carry the mark").toBeTruthy();
    // The mark must stay a sibling of the baseline-aligned title/subtitle pair,
    // never inside it: an inline box under a baseline-aligned flex item would
    // sink that group's baseline to the bottom of the square.
    const title = region.querySelector("[id]");
    expect(title?.parentElement?.contains(mark as Node)).toBe(false);
    expect(mark?.parentElement?.contains(title as Node)).toBe(true);
    expect(
      container.querySelectorAll(`svg[viewBox="${MARK_VIEWBOX}"]`)
    ).toHaveLength(1);
  });

  it("sits beside the Algo tab card heading", () => {
    render(<AlgoTab />);

    const [mark] = marks();
    expect(mark, "the gateway card heading should carry the mark").toBeTruthy();
    // Pinned to the heading wrapper, not the card body: the body already says
    // "AnyRouter" in prose, so this proves the mark is the heading's.
    expect(mark?.parentElement?.textContent).toBe("AnyRouter");
    expect(mark?.closest("p")).toBeNull();
  });

  it("is decorative, so the name is never announced twice", () => {
    render(<AttributionView models={models} />);

    for (const mark of marks()) {
      expect(mark.getAttribute("aria-hidden")).toBe("true");
      expect(mark.getAttribute("focusable")).toBe("false");
      expect(mark.getAttribute("role")).toBeNull();
    }
    // The wordmark text, not the svg, carries the accessible name.
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("paints with currentColor so one copy works in both themes", () => {
    render(<AttributionView models={models} />);

    for (const mark of marks()) {
      expect(mark.getAttribute("fill")).toBe("currentColor");
    }
    // A hardcoded brand black would be invisible on the dark theme.
    expect(document.body.innerHTML).not.toMatch(/fill="#(000|fff)/i);
  });
});
