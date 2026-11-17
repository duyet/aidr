/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { CategoryNav } from "./CategoryNav";

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const categories = [
  { name: "Models", count: 12 },
  { name: "Research", count: 5 },
];

function nav(selected: string[] = []) {
  const onToggle = vi.fn<(name: string) => void>();
  render(
    <CategoryNav
      categories={categories}
      selected={new Set(selected)}
      onToggle={onToggle}
      lang="en"
    />
  );
  return onToggle;
}

describe("CategoryNav", () => {
  it("renders All with the total, then one chip per topic with its count", () => {
    nav();
    expect(screen.getByRole("button", { name: "All 17" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Models 12" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Research 5" })).toBeTruthy();
  });

  it("marks All pressed with no filter, and only the chosen chips with one", () => {
    nav(["Research"]);
    const pressed = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(pressed("All 17")).toBe("false");
    expect(pressed("Models 12")).toBe("false");
    expect(pressed("Research 5")).toBe("true");
  });

  it("toggles a topic and reports it", () => {
    const onToggle = nav();
    fireEvent.click(screen.getByRole("button", { name: "Models 12" }));
    expect(onToggle).toHaveBeenCalledWith("Models");
    expect(track).toHaveBeenCalledWith("topic_filter", {
      tag: "Models",
      from: "nav",
    });
  });

  it("uses native buttons in the tab order, so Enter and Space work", () => {
    nav();
    for (const chip of screen.getAllByRole("button")) {
      expect(chip.tagName).toBe("BUTTON");
      expect(chip.getAttribute("type")).toBe("button");
      expect(chip.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("clears every chosen topic from All", () => {
    const onToggle = nav(["Models", "Research"]);
    fireEvent.click(screen.getByRole("button", { name: "All 17" }));
    expect(onToggle.mock.calls.map((c) => c[0]).sort()).toEqual([
      "Models",
      "Research",
    ]);
    expect(track).toHaveBeenCalledWith("topic_filter", {
      tag: "all",
      from: "nav",
    });
  });

  it("gives the chip row a name and a dot on each chip", () => {
    nav();
    expect(screen.getByRole("navigation", { name: "Topics" })).toBeTruthy();
    expect(document.querySelectorAll(".topic-dot")).toHaveLength(2);
  });

  it("renders nothing without topics", () => {
    render(
      <CategoryNav
        categories={[]}
        selected={new Set()}
        onToggle={() => {}}
        lang="en"
      />
    );
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
