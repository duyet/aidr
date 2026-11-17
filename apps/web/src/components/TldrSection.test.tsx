/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import type { Prefs } from "../lib/prefs";
import type { Lang, TldrBullet } from "../lib/types";
import {
  ConnectedTldrSection,
  makeBullets,
  PrefsHarness,
} from "./tldr-test-harness";

vi.mock("./SuggestTranslation", () => ({
  SuggestTranslation: () => null,
  SuggestionBadge: () => null,
}));
vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("../lib/vote-fn", () => ({
  castStoryVote: () => Promise.resolve({ myVote: 0, voteNet: 0, rankScore: 0 }),
  fetchMyVotes: () => Promise.resolve({ votes: {}, nets: {} }),
}));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function renderSection({
  bullets = makeBullets(16),
  secondBullets,
  lang = "en",
  initial,
  withCard = true,
}: {
  bullets?: TldrBullet[];
  secondBullets?: TldrBullet[];
  lang?: Lang;
  initial?: Partial<Prefs>;
  withCard?: boolean;
} = {}) {
  return render(
    <PrefsHarness lang={lang} initial={{ tldrView: "text", ...initial }}>
      <ConnectedTldrSection
        bullets={bullets}
        secondBullets={secondBullets}
        lang={lang}
        totalStories={349}
        updatedAt={Date.now()}
        lastFetchedAt={null}
        snapshotDate="2026-10-09"
        dateHref={withCard ? "/date/2026-10-09" : undefined}
      />
    </PrefsHarness>
  );
}

const prefsNow = () =>
  JSON.parse(screen.getByTestId("prefs").textContent ?? "{}");
const listItems = () => document.querySelectorAll("ol > li");

describe("image or text view", () => {
  it("saves the reader's choice as the tldrView pref", () => {
    renderSection();
    fireEvent.click(screen.getByRole("radio", { name: "Show day card" }));
    expect(prefsNow().tldrView).toBe("image");
    fireEvent.click(screen.getByRole("radio", { name: "Show text" }));
    expect(prefsNow().tldrView).toBe("text");
  });

  it("switches with the arrow keys and reports it", () => {
    renderSection();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Show text" }), {
      key: "ArrowLeft",
    });
    expect(prefsNow().tldrView).toBe("image");
    expect(vi.mocked(track)).toHaveBeenCalledWith("tldr_toggle", {
      view: "image",
    });
  });

  it("does not report a press on the view that is already showing", () => {
    renderSection();
    fireEvent.click(screen.getByRole("radio", { name: "Show text" }));
    expect(vi.mocked(track)).not.toHaveBeenCalled();
  });

  it("keeps the list when there is no day card to show", () => {
    // The day page has no archive link; an image pref must not hide its list.
    renderSection({ initial: { tldrView: "image" }, withCard: false });
    expect(screen.getByText("Bullet 1").closest("[hidden]")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "View" })).toBeNull();
    expect(screen.queryByAltText(/AI;DR card/)).toBeNull();
  });
});

describe("8 | 12 | 16 count", () => {
  it("offers one radio per count and marks the saved one", () => {
    renderSection();
    const group = screen.getByRole("radiogroup", { name: "Stories shown" });
    const names = within(group)
      .getAllByRole("radio")
      .map((r) => [r.textContent, r.getAttribute("aria-checked")]);
    expect(names).toEqual([
      ["8", "true"],
      ["12", "false"],
      ["16", "false"],
    ]);
    expect(listItems()).toHaveLength(8);
  });

  it("saves the count, reports it and paints that many stories", () => {
    renderSection();
    fireEvent.click(screen.getByRole("radio", { name: "12" }));
    expect(prefsNow().tldrCount).toBe(12);
    expect(listItems()).toHaveLength(12);
    expect(vi.mocked(track)).toHaveBeenCalledWith("prefs_change", {
      pref: "tldrCount",
      pref_value: "12",
    });
  });

  it("moves between counts with the arrow keys", () => {
    renderSection();
    fireEvent.keyDown(screen.getByRole("radio", { name: "8" }), {
      key: "ArrowRight",
    });
    expect(prefsNow().tldrCount).toBe(12);
  });

  it("Show more steps up one count and Show less goes back to 8", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(prefsNow().tldrCount).toBe(12);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(prefsNow().tldrCount).toBe(16);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(prefsNow().tldrCount).toBe(8);
    expect(vi.mocked(track).mock.calls.map((c) => c[1])).toEqual([
      { pref: "tldrCount", pref_value: "12" },
      { pref: "tldrCount", pref_value: "16" },
      { pref: "tldrCount", pref_value: "8" },
    ]);
  });

  it("shows no count control when every story already fits", () => {
    renderSection({ bullets: makeBullets(6) });
    expect(
      screen.queryByRole("radiogroup", { name: "Stories shown" })
    ).toBeNull();
    expect(listItems()).toHaveLength(6);
  });
});

describe("language", () => {
  it("labels the controls in Vietnamese", () => {
    renderSection({ lang: "vi" });
    expect(
      screen.getByRole("radiogroup", { name: "Kiểu hiển thị" })
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Xem ảnh tóm tắt" })).toBeTruthy();
    expect(
      screen.getByRole("radiogroup", { name: "Số tin hiển thị" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xem thêm" })).toBeTruthy();
    expect(screen.getByText(/349 tin/)).toBeTruthy();
  });

  it("shows each story's other-language title from the other column", () => {
    // Order differs on purpose: the match is by story id, not by position.
    const vi8 = makeBullets(8, "Tin");
    const en8 = makeBullets(8, "Story").reverse();
    renderSection({
      lang: "vi",
      bullets: vi8,
      secondBullets: en8,
      initial: { bilingual: true, bilingualFirst: "vi" },
    });
    const first = listItems()[0];
    expect(within(first as HTMLElement).getByText("Tin 1")).toBeTruthy();
    const second = within(first as HTMLElement).getByText("Story 1");
    expect(second.getAttribute("lang")).toBe("en");
    expect(second.className).toContain("bi-second");
  });

  it("never fills a missing second title with the leading one", () => {
    renderSection({
      lang: "vi",
      bullets: makeBullets(8, "Tin"),
      secondBullets: makeBullets(8, "Story").slice(1),
      initial: { bilingual: true, bilingualFirst: "vi" },
    });
    const first = listItems()[0] as HTMLElement;
    expect(first.querySelector(".bi-second")).toBeNull();
    expect(first.textContent).not.toContain("Story");
    expect(
      (listItems()[1] as HTMLElement).querySelector(".bi-second")
    ).not.toBeNull();
  });

  it("ignores the other column when bilingual mode is off", () => {
    renderSection({
      lang: "vi",
      bullets: makeBullets(8, "Tin"),
      secondBullets: makeBullets(8, "Story"),
    });
    expect(document.querySelector(".bi-second")).toBeNull();
  });
});
