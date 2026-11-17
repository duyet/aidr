/** @vitest-environment happy-dom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../../lib/types";
import { CopySheet } from "./CopySheet";

const item: FeedItem = {
  id: "abcdef12deadbeef",
  url: "https://www.example.com/post",
  title: "A faster model",
  title_vi: null,
  summary: "A short summary of the story.",
  summary_vi: null,
  category: "Models",
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

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      {open && (
        <CopySheet item={item} lang="en" onClose={() => setOpen(false)} />
      )}
    </>
  );
}

async function openSheet() {
  const opener = screen.getByRole("button", { name: "Open sheet" });
  opener.focus();
  await act(async () => {
    opener.click();
  });
  return opener;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CopySheet", () => {
  it("opens a modal named by its title, focused on the main action", async () => {
    render(<Harness />);
    await openSheet();
    const dialog = screen.getByRole("dialog", {
      name: "Copy AI;DR for social",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Copy post" })
    );
  });

  it("switches the post format and previews it", async () => {
    render(<Harness />);
    await openSheet();
    const post = () => screen.getByTestId("copy-sheet-post").textContent ?? "";
    expect(post()).toContain("A short summary of the story.");
    await act(async () => {
      screen.getByRole("radio", { name: "Title + link" }).click();
    });
    expect(
      screen
        .getByRole("radio", { name: "Title + link" })
        .getAttribute("aria-checked")
    ).toBe("true");
    expect(post()).not.toContain("A short summary of the story.");
    expect(post()).toContain("A faster model");
  });

  it("copies the post and says so", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<Harness />);
    await openSheet();
    await act(async () => {
      screen.getByRole("button", { name: "Copy post" }).click();
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("A short summary of the story.")
    );
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });

  it("selects the preview by hand when the clipboard is refused", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    render(<Harness />);
    await openSheet();
    await act(async () => {
      screen.getByRole("button", { name: "Copy post" }).click();
    });
    expect(screen.getByRole("status").textContent).toContain("Selected");
  });

  it("closes on Escape and returns focus to the opener", async () => {
    render(<Harness />);
    const opener = await openSheet();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
