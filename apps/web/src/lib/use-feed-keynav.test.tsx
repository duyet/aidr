/**
 * j/k on the home feed move focus between the AI;DR items and the story
 * rows. The keys are plain letters, so the handler must stay out of the way
 * whenever a letter means something else: typing in the search box, a
 * modifier shortcut, or a story dialog that owns the keyboard.
 *
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFeedKeyNav } from "./use-feed-keynav";

function Feed({ modal = false }: { modal?: boolean }) {
  useFeedKeyNav();
  return (
    <div>
      <input aria-label="search" />
      <a href="/a" data-keynav="">
        digest 1
      </a>
      <div hidden>
        <a href="/hidden" data-keynav="">
          hidden digest
        </a>
      </div>
      {["row 1", "row 2"].map((label) => (
        // biome-ignore lint/a11y/useSemanticElements: mirrors StoryRow's div+role=button
        <div key={label} role="button" tabIndex={0} data-keynav="">
          {label}
        </div>
      ))}
      {modal ? <div role="dialog" aria-modal="true" /> : null}
    </div>
  );
}

const focused = () => document.activeElement?.textContent;

beforeEach(() => {
  // happy-dom has no layout: give every element one box at the top of the
  // viewport, and a no-op scrollIntoView.
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("feed j/k navigation", () => {
  it("steps through items and rows in page order, skipping hidden ones", () => {
    render(<Feed />);
    fireEvent.keyDown(document.body, { key: "j" });
    expect(focused()).toBe("digest 1");
    fireEvent.keyDown(document.activeElement as Element, { key: "j" });
    expect(focused()).toBe("row 1");
    fireEvent.keyDown(document.activeElement as Element, { key: "j" });
    expect(focused()).toBe("row 2");
    fireEvent.keyDown(document.activeElement as Element, { key: "k" });
    expect(focused()).toBe("row 1");
  });

  it("stops at the ends instead of wrapping", () => {
    render(<Feed />);
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.activeElement as Element, { key: "k" });
    expect(focused()).toBe("digest 1");
  });

  it("leaves letters typed in a field alone", () => {
    const { getByLabelText } = render(<Feed />);
    const input = getByLabelText("search");
    input.focus();
    fireEvent.keyDown(input, { key: "j" });
    expect(document.activeElement).toBe(input);
  });

  it("ignores j with a modifier", () => {
    render(<Feed />);
    fireEvent.keyDown(document.body, { key: "j", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "j", metaKey: true });
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing while a modal dialog is open", () => {
    render(<Feed modal />);
    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.activeElement).toBe(document.body);
  });
});
