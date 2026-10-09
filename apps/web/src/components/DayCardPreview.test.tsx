/**
 * The image view swaps the AI;DR bullet list for the day card at the full
 * body width (as the new-tab extension does). It used to sit in an absolute
 * overlay that took the list's height, so the 1200×630 card showed small.
 *
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TldrBullet } from "../lib/types";
import { TldrSection } from "./TldrSection";

// Bullet rows open story dialogs whose server fns import cloudflare:workers,
// which happy-dom cannot resolve. Neither is used here.
vi.mock("./SuggestTranslation", () => ({
  SuggestTranslation: () => null,
  SuggestionBadge: () => null,
}));
vi.mock("../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));

const bullets: TldrBullet[] = Array.from({ length: 8 }, (_, i) => ({
  text: `Bullet ${i + 1}`,
  item_ids: [`item${i}`],
  image_url: null,
}));

function renderSection() {
  return render(
    <TldrSection
      bullets={bullets}
      defaultCount={8}
      lang="en"
      totalStories={349}
      updatedAt={Date.now()}
      lastFetchedAt={null}
      snapshotDate="2026-10-09"
      dateHref="/date/2026-10-09"
    />
  );
}

afterEach(cleanup);

describe("day card image view", () => {
  it("shows the card in place of the list and keeps the footer", () => {
    renderSection();
    expect(screen.getByText("Bullet 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show day card" }));

    const card = screen.getByAltText("AI;DR card for 2026-10-09");
    expect(card.getAttribute("src")).toBe(
      "/api/og/date/2026-10-09.png?lang=en"
    );
    // In normal flow at full width, not an overlay sized by the list.
    const frame = card.parentElement as HTMLElement;
    expect(frame.hidden).toBe(false);
    expect(frame.className).not.toMatch(/\babsolute\b/);
    expect(card.className).toContain("max-w-full");
    expect(card.className).not.toContain("max-h-full");
    // The list and its more/less control are out of the page, not covered.
    expect(screen.getByText("Bullet 1").closest("[hidden]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.getByText(/349 stories/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Show day card" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("brings the list back on text view", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Show day card" }));
    fireEvent.click(screen.getByRole("button", { name: "Show text" }));

    expect(screen.getByText("Bullet 1").closest("[hidden]")).toBeNull();
    const card = screen.getByAltText("AI;DR card for 2026-10-09");
    expect((card.parentElement as HTMLElement).hidden).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Show text" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});
