/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemMailStats } from "../../lib/mail-stats-query";
import { useSystemData } from "../../lib/use-system-stats";
import { MailStatsCard } from "./MailStatsCard";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

const stats: SystemMailStats = {
  window_days: 28,
  by_lang: [
    { lang: "en", sent: 120, failed: 3, unsubscribed: 2 },
    { lang: "vi", sent: 80, failed: 0, unsubscribed: 1 },
  ],
};

describe("MailStatsCard", () => {
  it("shows sent, failed and unsubscribed per language", () => {
    mockUseSystemData.mockReturnValue({ data: stats, error: false });
    render(<MailStatsCard />);
    const english = screen.getByText("English").closest("li");
    expect(english?.textContent).toContain("Sent120");
    expect(english?.textContent).toContain("Failed3");
    expect(english?.textContent).toContain("Unsubscribed2");
    expect(screen.getByText("Vietnamese").closest("li")?.textContent).toContain(
      "Sent80"
    );
  });

  it("states the empty case instead of drawing zeros", () => {
    mockUseSystemData.mockReturnValue({
      data: { window_days: 28, by_lang: [] },
      error: false,
    });
    render(<MailStatsCard />);
    expect(screen.getByText("No digest sends recorded yet.")).toBeTruthy();
  });
});
