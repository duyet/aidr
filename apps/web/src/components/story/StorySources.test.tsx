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

/** The wire format permits metadata-empty rows (e.g. `{ kind: "source" }`),
 * which the TypeScript type does not model, so build them explicitly. */
const emptyRow = (kind = "source") => ({ kind }) as unknown as ItemSource;

/** The divider is the `·` separator. The external-link icon is also
 * aria-hidden, so match on the separator character rather than the attribute. */
function dividerIn(root: HTMLElement | null): HTMLElement | null {
  const candidates = Array.from(
    root?.querySelectorAll<HTMLElement>("[aria-hidden='true']") ?? []
  );
  return candidates.find((el) => (el.textContent ?? "").includes("·")) ?? null;
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

  it("keeps the divider, external-link icon, and host in one non-breaking unit", () => {
    const { container } = renderSources([source], "en");

    // happy-dom performs no layout, so wrapping cannot be observed directly.
    // Assert the DOM contract that produces it: the separator and the link
    // share a single nowrap unit instead of being independent siblings.
    const unit = container.querySelector<HTMLElement>(
      "[data-source-meta-unit]"
    );
    expect(unit).toBeTruthy();
    expect(unit?.className).toContain("whitespace-nowrap");
    // Atomic unit capped at the row width, so a long host wraps inside the
    // unit rather than overflowing the row.
    expect(unit?.className).toContain("inline-block");
    expect(unit?.className).toContain("max-w-full");

    const link = screen.getByRole("link", {
      name: "Open source: anthropic.com",
    });
    expect(unit?.contains(link)).toBe(true);
    expect(unit?.querySelector("svg")).toBe(link.querySelector("svg"));
    expect(dividerIn(unit)).toBeTruthy();
    expect(unit?.textContent).toContain("·");
    expect(unit?.textContent).toContain("anthropic.com");
  });

  it("keeps the unit bound to the row for an over-long publisher host", () => {
    const host = `${"very-long-subdomain.".repeat(8)}example.com`;
    const { container } = renderSources(
      [{ ...source, url: `https://${host}/a-very-long-path-segment` }],
      "en"
    );

    const unit = container.querySelector<HTMLElement>(
      "[data-source-meta-unit]"
    );
    expect(unit?.className).toContain("max-w-full");
    expect(unit?.textContent).toContain(host);
    // The host is allowed to break internally, so no horizontal overflow.
    expect(unit?.querySelector("a")?.className).toContain(
      "overflow-wrap:anywhere"
    );
  });

  it("renders a localized empty state instead of a lone role label", () => {
    const { container } = renderSources([emptyRow("source")], "vi");
    const section = screen.getByRole("region", { name: "Nguồn chính" });

    expect(section.tagName).toBe("SECTION");
    expect(container.textContent).toContain(
      "Chưa có thông tin chi tiết về nguồn."
    );
    expect(screen.queryByText("SOURCE")).toBeNull();
    // No empty list is announced.
    expect(within(section).queryByRole("list")).toBeNull();
    expect(container.querySelector("[data-source-meta-unit]")).toBeNull();
  });

  it("renders the English empty state for metadata-empty rows", () => {
    renderSources([emptyRow("source")], "en");
    const section = screen.getByRole("region", { name: "Key sources" });
    expect(section.textContent).toContain(
      "No source details are available yet."
    );
    expect(within(section).queryByRole("list")).toBeNull();
  });

  it("skips metadata-empty rows while keeping the list accessible", () => {
    renderSources(
      [emptyRow("discussion"), source, emptyRow("source"), emptyRow("support")],
      "en"
    );

    const section = screen.getByRole("region", { name: "Key sources" });
    const list = within(section).getByRole("list");
    const rows = within(list).getAllByRole("listitem");

    expect(list.tagName).toBe("OL");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Anthropic");
    expect(screen.queryByText("DISCUSSION")).toBeNull();
    expect(screen.queryByText("SUPPORT")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open source: anthropic.com" })
    ).toBeTruthy();
  });

  it("treats an unsafe-URL-only row as metadata-empty", () => {
    const { container } = renderSources(
      [
        {
          kind: "support",
          author: null,
          posted_at: null,
          quote: null,
          url: "javascript:alert('nope')",
        },
      ],
      "en"
    );

    expect(container.textContent).toContain(
      "No source details are available yet."
    );
    expect(screen.queryByText("SUPPORT")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});
