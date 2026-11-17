/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { TrendingChips } from "./TrendingChips";

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const tags = Array.from({ length: 12 }, (_, i) => ({
  tag: `Tag${i + 1}`,
  count: 20 - i,
}));

function list(selectedTag: string | null = null) {
  const onSelectTag = vi.fn<(tag: string | null) => void>();
  render(
    <TrendingChips
      trending={tags}
      label="Trending"
      selectedTag={selectedTag}
      onSelectTag={onSelectTag}
    />
  );
  return onSelectTag;
}

describe("TrendingChips", () => {
  it("lists the first eight tags with their counts", () => {
    list();
    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Tag1 20" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tag9/ })).toBeNull();
  });

  it("keeps a selected tag past the cut listed, so it can be cleared", () => {
    const onSelectTag = list("tag11");
    const row = screen.getByRole("button", { name: "Tag11 10" });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(row);
    expect(onSelectTag).toHaveBeenCalledWith(null);
  });

  it("selects a tag and reports it", () => {
    const onSelectTag = list();
    fireEvent.click(screen.getByRole("button", { name: "Tag2 19" }));
    expect(onSelectTag).toHaveBeenCalledWith("Tag2");
    expect(track).toHaveBeenCalledWith("topic_filter", {
      tag: "Tag2",
      from: "trending",
    });
  });

  it("names the list", () => {
    list();
    expect(screen.getByRole("heading", { name: "Trending" })).toBeTruthy();
  });
});
