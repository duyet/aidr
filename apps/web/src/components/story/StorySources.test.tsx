/** @vitest-environment happy-dom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemSource } from "../../lib/types";
import { StorySources } from "./StorySources";

const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }));

vi.mock("@aidr/ui/track", () => ({ track: trackMock }));

afterEach(() => {
  cleanup();
  trackMock.mockReset();
});

const source = {
  kind: "source",
  author: "Anthropic",
  posted_at: 1_789_000_000,
  quote: "A compact excerpt that can wrap without separating its metadata.",
  url: "https://www.anthropic.com/news/example",
} satisfies ItemSource;

function renderSources(sources: ItemSource[], lang: "en" | "vi" = "vi") {
  return render(
    <StorySources sources={sources} lang={lang} itemId="story-123" />
  );
}

describe("StorySources", () => {
  it("renders a semantic compact list with connected inline metadata", () => {
    renderSources([
      source,
      {
        ...source,
        kind: "support",
        author: "Research partner",
        quote: "Supporting context",
        url: "https://support.example.com/story",
      },
      {
        ...source,
        kind: "discussion",
        author: "Community",
        quote: null,
        url: "https://news.example.com/thread?id=1",
      },
    ]);

    const section = screen.getByRole("region", { name: "Nguồn chính" });
    const list = within(section).getByRole("list");
    const rows = within(list).getAllByRole("listitem");

    expect(section.tagName).toBe("SECTION");
    expect(rows).toHaveLength(3);
    expect(rows[0].className).toContain("flex");
    expect(rows[0].className).not.toContain("grid");
    expect(within(rows[0]).getByText("SOURCE")).toBeTruthy();
    expect(within(rows[1]).getByText("SUPPORT")).toBeTruthy();
    expect(within(rows[2]).getByText("THẢO LUẬN")).toBeTruthy();
    expect(rows[0].textContent).toContain("Anthropic");
    expect(rows[0].textContent).toContain(
      "A compact excerpt that can wrap without separating its metadata."
    );
    expect(rows[0].textContent).toContain("anthropic.com");
    expect(rows[0].querySelector("time")?.getAttribute("datetime")).toBe(
      new Date(source.posted_at * 1000).toISOString()
    );
  });

  it("keeps outbound links real, labeled, keyboard-focusable, and tracked", () => {
    renderSources([source], "en");

    const link = screen.getByRole("link", {
      name: "Open source: anthropic.com",
    });

    expect(link.getAttribute("href")).toBe(
      "https://www.anthropic.com/news/example"
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.className).toContain("focus-visible:outline-2");

    link.focus();
    expect(document.activeElement).toBe(link);

    fireEvent.click(link);
    expect(trackMock).toHaveBeenCalledWith("story_open", {
      item_id: "story-123",
    });
  });

  it("keeps metadata but omits unsafe source URLs", () => {
    const { container } = renderSources([
      {
        kind: "support",
        author: "Unsafe publisher",
        posted_at: null,
        quote: "Still useful context",
        url: "javascript:alert('nope')",
      },
      {
        kind: "source",
        author: "Data URL publisher",
        posted_at: null,
        quote: null,
        url: "data:text/html,nope",
      },
    ]);

    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Unsafe publisher")).toBeTruthy();
    expect(container.textContent).toContain("Still useful context");
    expect(screen.getByText("Data URL publisher")).toBeTruthy();
  });

  it("does not render an empty section", () => {
    const { container } = renderSources([]);
    expect(container.firstChild).toBeNull();
  });
});
