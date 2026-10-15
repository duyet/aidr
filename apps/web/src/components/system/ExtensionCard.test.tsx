/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemExtEvents } from "../../lib/ext-events-query";
import { useSystemData } from "../../lib/use-system-stats";
import { ExtensionCard } from "./ExtensionCard";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

const events: SystemExtEvents = {
  window_days: 28,
  total_opens: 17,
  by_day: [
    { day: "2026-10-16", opens: 9 },
    { day: "2026-10-15", opens: 8 },
  ],
  by_channel: [{ name: "telegram", clicks: 3 }],
};

describe("ExtensionCard", () => {
  it("shows daily new-tab opens and clicks by channel (defect: the counts never surface on /data)", () => {
    mockUseSystemData.mockReturnValue({ data: events, error: false });
    render(<ExtensionCard />);
    expect(screen.getByText("2026-10-16").parentElement?.textContent).toContain(
      "9"
    );
    expect(
      screen.getByText("Click: telegram").parentElement?.textContent
    ).toContain("3");
    expect(screen.getByText(/17 new-tab opens/)).toBeTruthy();
  });

  it("says so when nothing is recorded", () => {
    mockUseSystemData.mockReturnValue({
      data: { ...events, total_opens: 0, by_day: [], by_channel: [] },
      error: false,
    });
    render(<ExtensionCard />);
    expect(screen.getByText("No extension events recorded yet.")).toBeTruthy();
  });
});
