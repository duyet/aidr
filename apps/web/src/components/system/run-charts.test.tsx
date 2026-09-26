/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowRunRow } from "../../lib/system-queries";
import { durationRows } from "./RunDurationChart";
import { outcomeRows } from "./RunOutcomeChart";

/** The dither canvas needs layout measurement happy-dom does not provide, so
 *  the chart shell is stubbed. What these tests pin down is the *series* the
 *  charts hand it — that is what the old hand-rolled bars got wrong, and it
 *  is the part a DOM assertion on pixel height could never catch. */
vi.mock("../dither-kit/bar", () => ({ Bar: () => null }));
vi.mock("../dither-kit/grid", () => ({ Grid: () => null }));
vi.mock("../dither-kit/x-axis", () => ({ XAxis: () => null }));
vi.mock("../dither-kit/y-axis", () => ({ YAxis: () => null }));
vi.mock("../dither-kit/tooltip", () => ({ Tooltip: () => null }));
vi.mock("../dither-kit/block-legend", () => ({
  BlockLegend: ({ values }: { values?: Record<string, number> }) => (
    <dl data-testid="legend">
      {Object.entries(values ?? {}).map(([k, v]) => (
        <div key={k} data-series={k}>
          {v}
        </div>
      ))}
    </dl>
  ),
}));

let captured: { data: Record<string, unknown>[] } | null = null;
vi.mock("../dither-kit/bar-chart", () => ({
  BarChart: ({
    data,
    children,
  }: {
    data: Record<string, unknown>[];
    children?: React.ReactNode;
  }) => {
    captured = { data };
    return <div data-testid="chart">{children}</div>;
  },
}));

const { RunDurationChart } = await import("./RunDurationChart");
const { RunOutcomeChart } = await import("./RunOutcomeChart");

afterEach(() => {
  cleanup();
  captured = null;
});

function run(over: Partial<WorkflowRunRow> = {}): WorkflowRunRow {
  return {
    id: "run-1",
    started_at: 1_700_000_000,
    finished_at: 1_700_000_157,
    items_fetched: 100,
    items_new: 5,
    error: null,
    stats: null,
    ...over,
  };
}

describe("outcomeRows", () => {
  it("reads new/merged/rejected from the run stats JSON", () => {
    const rows = outcomeRows([
      run({
        stats: { new: 5, merged: 2, rejected: 1, published: 2 },
      }),
    ]);
    expect(rows[0]).toMatchObject({ new: 5, merged: 2, rejected: 1 });
  });

  it("orders oldest to newest even though the endpoint returns newest-first", () => {
    const rows = outcomeRows([
      run({ id: "newest", started_at: 200 }),
      run({ id: "oldest", started_at: 100 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["oldest", "newest"]);
  });

  it("falls back to items_new when the row predates the stats column", () => {
    const rows = outcomeRows([run({ items_new: 9, stats: null })]);
    // Honest values, not invented: merged/rejected have no legacy column.
    expect(rows[0]).toMatchObject({ new: 9, merged: 0, rejected: 0 });
  });

  it("keeps a row whose stats exist but carry no outcome counts", () => {
    const rows = outcomeRows([run({ stats: { tokens: 100 } })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ new: 5, merged: 0, rejected: 0 });
  });
});

describe("durationRows", () => {
  it("plots finished runs as seconds", () => {
    expect(durationRows([run()])[0].seconds).toBe(157);
  });

  it("drops a run that never finished instead of charting it as zero", () => {
    const rows = durationRows([
      run({ id: "done" }),
      run({ id: "in-flight", finished_at: null }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["done"]);
  });

  it("keeps a same-second run as a real zero, not a dropped point", () => {
    const rows = durationRows([run({ finished_at: 1_700_000_000 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].seconds).toBe(0);
  });

  it("labels a run with no timestamp instead of printing Invalid Date", () => {
    // Outcomes keeps the row (it still has a new/merged/rejected value), so
    // it is the chart that has to degrade the labels rather than the axis.
    const rows = outcomeRows([run({ started_at: null, items_new: 3 })]);
    expect(rows[0].label).toBe("—");
    expect(rows[0].at).toBe("unknown start");

    // Duration has nothing to plot without a timestamp, so it drops the row.
    expect(durationRows([run({ started_at: null })])).toEqual([]);
  });
});

describe("run charts", () => {
  it("hands the outcome chart non-zero stacked series", () => {
    render(
      <RunOutcomeChart
        runs={[run({ stats: { new: 5, merged: 1, rejected: 0 } })]}
        emptyLabel="No data yet."
      />
    );
    // The regression: the old bars rendered from these same numbers and
    // collapsed to 0 height, so the card read as permanently empty.
    expect(captured?.data[0]).toMatchObject({ new: 5, merged: 1, rejected: 0 });
  });

  it("shows the window totals for each outcome series", () => {
    render(
      <RunOutcomeChart
        runs={[
          run({ id: "a", stats: { new: 5, merged: 1, rejected: 2 } }),
          run({ id: "b", stats: { new: 3, merged: 0, rejected: 1 } }),
        ]}
        emptyLabel="No data yet."
      />
    );
    const legend = screen.getByTestId("legend");
    expect(legend.querySelector('[data-series="new"]')?.textContent).toBe("8");
    expect(legend.querySelector('[data-series="merged"]')?.textContent).toBe(
      "1"
    );
    expect(legend.querySelector('[data-series="rejected"]')?.textContent).toBe(
      "3"
    );
  });

  it("falls back to the empty label only when there is genuinely nothing", () => {
    const { rerender } = render(
      <RunOutcomeChart
        runs={[run({ items_new: 0, stats: null })]}
        emptyLabel="No data yet."
      />
    );
    expect(screen.getByText("No data yet.")).toBeTruthy();

    rerender(
      <RunOutcomeChart
        runs={[run({ items_new: 1, stats: null })]}
        emptyLabel="No data yet."
      />
    );
    expect(screen.queryByText("No data yet.")).toBeNull();
  });

  it("summarises duration with avg, peak and total", () => {
    render(
      <RunDurationChart
        runs={[
          run({ id: "a", started_at: 100, finished_at: 160 }),
          run({ id: "b", started_at: 200, finished_at: 320 }),
        ]}
        emptyLabel="No data yet."
      />
    );
    expect(screen.getByText("avg").nextSibling?.textContent).toBe("90s");
    expect(screen.getByText("peak").nextSibling?.textContent).toBe("120s");
    expect(screen.getByText("total").nextSibling?.textContent).toBe("3m");
  });

  it("states the empty label when no run ever finished", () => {
    render(
      <RunDurationChart
        runs={[run({ finished_at: null })]}
        emptyLabel="No data yet."
      />
    );
    expect(screen.getByText("No data yet.")).toBeTruthy();
  });
});
