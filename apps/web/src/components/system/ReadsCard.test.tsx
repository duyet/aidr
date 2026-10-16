/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemReads } from "../../lib/reads-query";
import { useSystemData } from "../../lib/use-system-stats";
import { ReadsCard } from "./ReadsCard";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

const reads: SystemReads = {
  window_days: 28,
  total: 41,
  by_category: [{ name: "Models", reads: 41, items: 6 }],
  by_channel: [{ name: "web", reads: 41 }],
  by_kind: [
    { name: "open", reads: 29 },
    { name: "outbound", reads: 12 },
  ],
  top_stories: [],
};

describe("ReadsCard", () => {
  it("shows opens and outbound clicks as separate totals", () => {
    mockUseSystemData.mockReturnValue({ data: reads, error: false });
    render(<ReadsCard />);
    expect(screen.getByText("Opens").parentElement?.textContent).toContain(
      "29"
    );
    expect(
      screen.getByText("Outbound clicks").parentElement?.textContent
    ).toContain("12");
  });
});
