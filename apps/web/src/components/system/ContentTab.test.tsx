/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemActivity, SystemOverview } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { ContentTab } from "./ContentTab";
import { API } from "./endpoints";

vi.mock("../../lib/use-system-stats", () => ({ useSystemData: vi.fn() }));

// `TabsContent` only mounts inside a `Tabs` root; this file is about the
// catalog rows, so unwrap it the same way the overview test does.
vi.mock("@aidr/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aidr/ui")>()),
  TabsContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./DitherCharts", () => ({ CategoryDonut: () => null }));

const mockUseSystemData = vi.mocked(useSystemData);

afterEach(() => {
  cleanup();
  mockUseSystemData.mockReset();
});

const ACTIVITY: SystemActivity = {
  itemsPerDay: [],
  itemsByStatus: [],
  itemsBySource: [],
  itemsByCategory: [],
};

/** Counts the catalog card reads. The three translation fields are optional
 * here because a cached overview from before they existed still renders. */
type CatalogTotals = Omit<
  SystemOverview["totals"],
  "viTitles" | "viSummaries" | "contentEdits"
> &
  Partial<
    Pick<SystemOverview["totals"], "viTitles" | "viSummaries" | "contentEdits">
  >;

const BASE_TOTALS: CatalogTotals = {
  items: 1234,
  translations: 1200,
  tldrSnapshots: 900,
  subscribers: 42,
  sources: 5,
  itemSourcesRows: 8,
};

function overview(totals: CatalogTotals): SystemOverview {
  return {
    // The wire type requires every count. A stale body does not have them.
    totals: totals as SystemOverview["totals"],
    databaseBytes: 25_000_000,
    tokens: { total: 0, avgPerItem: 0 },
    runsToday: 0,
    lastRun: null,
    latestTldrDate: "2026-01-01",
  };
}

function serve(data: SystemOverview): void {
  mockUseSystemData.mockImplementation((path: string) => {
    if (path === API.overview) return { data, error: false } as never;
    if (path === API.activity) return { data: ACTIVITY, error: false } as never;
    return { data: null, error: false } as never;
  });
}

const CATALOG_LABELS = [
  "Database size",
  "Stories",
  "Translations",
  "Vietnamese titles",
  "Vietnamese summaries",
  "Content edits",
  "AI;DR digests",
  "Latest digest",
  "Configured sources",
  "Key-source citations",
] as const;

function valueFor(label: string): string {
  const row = screen.getByText(label).closest("div");
  return row?.querySelector("dd")?.textContent ?? "";
}

describe("ContentTab catalog", () => {
  it("shows an em dash when a stale overview omits catalog counts", () => {
    serve(overview(BASE_TOTALS));
    render(<ContentTab lang="en" />);

    for (const label of CATALOG_LABELS) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(valueFor("Vietnamese titles")).toBe("—");
    expect(valueFor("Vietnamese summaries")).toBe("—");
    expect(valueFor("Content edits")).toBe("—");
    expect(valueFor("Stories")).toBe("1,234");
    expect(valueFor("Translations")).toBe("1,200");
    expect(valueFor("Latest digest")).toBe("2026-01-01");
  });

  it("formats finite catalog counts", () => {
    serve(
      overview({
        ...BASE_TOTALS,
        viTitles: 1100,
        viSummaries: 1000,
        contentEdits: 4,
      })
    );
    render(<ContentTab lang="en" />);

    expect(valueFor("Vietnamese titles")).toBe("1,100");
    expect(valueFor("Vietnamese summaries")).toBe("1,000");
    expect(valueFor("Content edits")).toBe("4");
  });

  it("shows an em dash for a non-finite catalog count", () => {
    serve(
      overview({
        ...BASE_TOTALS,
        viTitles: Number.POSITIVE_INFINITY,
        viSummaries: Number.NaN,
        contentEdits: 4,
      })
    );
    render(<ContentTab lang="en" />);

    expect(valueFor("Vietnamese titles")).toBe("—");
    expect(valueFor("Vietnamese summaries")).toBe("—");
    expect(valueFor("Content edits")).toBe("4");
  });
});
