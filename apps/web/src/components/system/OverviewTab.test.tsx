/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountCount } from "../../../worker/account-count.js";
import type { SystemActivity, SystemOverview } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { API } from "./endpoints";
import { OverviewTab } from "./OverviewTab";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

// `TabsContent` only mounts inside a `Tabs` root; the overview's own markup
// is what this file is about, so unwrap it.
vi.mock("@aidr/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aidr/ui")>()),
  TabsContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./DitherCharts", () => ({ ItemsAreaChart: () => null }));
vi.mock("./TokenBurnCard", () => ({ TokenBurnCard: () => null }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

const OVERVIEW: SystemOverview = {
  totals: {
    items: 1234,
    translations: 1200,
    tldrSnapshots: 900,
    subscribers: 42,
    sources: 5,
    itemSourcesRows: 1234,
  },
  tokens: { total: 9_000_000, avgPerItem: 7290 },
  runsToday: 7,
  lastRun: {
    id: "run_1",
    started_at: 1,
    finished_at: 2,
    items_fetched: 30,
    items_new: 12,
    error: null,
    stats: null,
  },
  latestTldrDate: "2026-01-01",
};

const ACTIVITY: SystemActivity = {
  itemsPerDay: [],
  itemsByStatus: [],
  itemsBySource: [],
  itemsByCategory: [],
};

/** Route each hook call to the state its endpoint would have produced. */
function serve(states: Partial<Record<string, unknown>>): void {
  mockUseSystemData.mockImplementation((path: string) => {
    return (states[path] ?? { data: null, error: false }) as never;
  });
}

describe("OverviewTab", () => {
  it("promotes signups to a first-class metric of the same row", () => {
    serve({
      [API.overview]: { data: OVERVIEW },
      [API.accounts]: {
        data: { total: 37, source: "d1", status: "available" },
      },
      [API.activity]: { data: ACTIVITY },
    });
    render(<OverviewTab />);

    expect(screen.getByText("Signups")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    // Stories, tokens, runs, subscribers, signups, last run — one flat row.
    for (const label of [
      "Stories",
      "Tokens",
      "Runs today",
      "Subscribers",
      "Signups",
      "Last run",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("keeps email subscribers distinct from Clerk signups", () => {
    serve({
      [API.overview]: { data: OVERVIEW },
      [API.accounts]: {
        data: { total: 37, source: "d1", status: "available" },
      },
      [API.activity]: { data: ACTIVITY },
    });
    render(<OverviewTab />);

    const subscribers = screen.getByText("Subscribers").closest("div");
    const signups = screen.getByText("Signups").closest("div");
    expect(subscribers?.textContent).toContain("42");
    expect(subscribers?.textContent).toContain("Email subscriptions");
    expect(signups?.textContent).toContain("37");
    expect(signups?.textContent).toContain("Clerk accounts");
    // One label, one number: the two metrics never share a tile.
    expect(subscribers?.textContent).not.toContain("37");
    expect(signups?.textContent).not.toContain("42");
  });

  it("still shows signups while the overview batch is in flight", () => {
    serve({
      [API.overview]: { data: null },
      [API.accounts]: {
        data: { total: 37, source: "d1", status: "available" },
      },
      [API.activity]: { data: null },
    });
    render(<OverviewTab />);

    expect(screen.getByText("Signups")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    // The four overview tiles are placeholders, not invented numbers.
    expect(screen.queryByText("Stories")).toBeNull();
    expect(screen.queryByText("1.2K")).toBeNull();
    expect(screen.getByText("Last run")).toBeTruthy();
    expect(screen.queryByText("Healthy")).toBeNull();
  });

  it("keeps signups when the overview batch fails", () => {
    serve({
      [API.overview]: { data: null, error: true },
      [API.accounts]: {
        data: { total: 37, source: "d1", status: "available" },
      },
      [API.activity]: { data: null, error: true },
    });
    render(<OverviewTab />);

    expect(screen.getByText("37")).toBeTruthy();
    // The overview batch's own failure is stated, not silently zeroed.
    expect(screen.getAllByText("Couldn't load.").length).toBeGreaterThan(0);
  });

  it("does not paint a signup total before the accounts endpoint answers", () => {
    serve({
      [API.overview]: { data: OVERVIEW },
      [API.accounts]: { data: null },
      [API.activity]: { data: ACTIVITY },
    });
    render(<OverviewTab />);

    expect(screen.getByText("Signups")).toBeTruthy();
    expect(screen.queryByText("37")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it("loads the accounts endpoint separately from the overview batch", () => {
    serve({
      [API.overview]: { data: OVERVIEW },
      [API.activity]: { data: ACTIVITY },
    });
    render(<OverviewTab />);

    const paths = mockUseSystemData.mock.calls.map(([path]) => path);
    expect(paths).toContain(API.accounts);
    expect(paths).toContain(API.overview);
  });

  it("marks a failed last run instead of calling it healthy", () => {
    serve({
      [API.overview]: {
        data: { ...OVERVIEW, lastRun: { ...OVERVIEW.lastRun!, error: "boom" } },
      },
      [API.accounts]: {
        data: { total: null, source: "d1", status: "unconfigured" },
      } satisfies Record<string, AccountCount>,
      [API.activity]: { data: ACTIVITY },
    });
    render(<OverviewTab />);

    expect(screen.getByText("Failed")).toBeTruthy();
    // No fake signup total while the mirror is still empty.
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
