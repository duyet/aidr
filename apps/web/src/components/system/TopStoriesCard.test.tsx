/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemReads } from "../../lib/reads-query";
import { useSystemData } from "../../lib/use-system-stats";
import { TopStoriesCard } from "./TopStoriesCard";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

const base: SystemReads = {
  window_days: 28,
  total: 0,
  by_category: [],
  by_channel: [],
  by_kind: [],
  top_stories: [],
};

describe("TopStoriesCard", () => {
  it("lists each channel's stories with opens, outbound and the ratio (defect: the ratio is opens/outbound or missing)", () => {
    mockUseSystemData.mockReturnValue({
      data: {
        ...base,
        top_stories: [
          {
            channel: "telegram",
            stories: [
              {
                id: "abcdef1234567890",
                title: "Big story",
                opens: 8,
                outbound: 2,
              },
            ],
          },
        ],
      },
      error: false,
    });
    render(<TopStoriesCard />);
    expect(screen.getByText("telegram")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Big story" });
    expect(link.getAttribute("href")).toBe("/abcdef12");
    const cells = [...(link.closest("tr")?.querySelectorAll("td") ?? [])].map(
      (td) => td.textContent
    );
    expect(cells).toEqual(["Big story", "8", "2", "25%"]);
  });

  it("shows the empty state when no story reaches the minimum (defect: an empty table renders)", () => {
    mockUseSystemData.mockReturnValue({ data: base, error: false });
    render(<TopStoriesCard />);
    expect(screen.getByText(/No story has 3 opens yet/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
