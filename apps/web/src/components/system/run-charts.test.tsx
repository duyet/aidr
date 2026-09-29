/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowRunRow } from "../../lib/system-queries";
import type { Lang } from "../../lib/types";

/** The dither canvas needs layout measurement happy-dom does not provide, so
 *  the chart shell is stubbed. What these tests pin down is the *series* the
 *  charts hand it — that is what the old hand-rolled bars got wrong, and it
 *  is the part a DOM assertion on pixel height could never catch. */
vi.mock("../dither-kit/bar", () => ({ Bar: () => null }));
vi.mock("../dither-kit/grid", () => ({ Grid: () => null }));
vi.mock("../dither-kit/x-axis", () => ({ XAxis: () => null }));
vi.mock("../dither-kit/y-axis", () => ({ YAxis: () => null }));
vi.mock("../dither-kit/tooltip", () => ({ Tooltip: () => null }));
// Renders both the series key and its config label, so a series dropped from
// CONFIG — or a label that drifts from the key — is visible here.
vi.mock("../dither-kit/block-legend", () => ({
  BlockLegend: ({
    config,
    values,
  }: {
    config: Record<string, { label?: string }>;
    values?: Record<string, number>;
  }) => (
    <dl data-testid="legend">
      {Object.entries(config).map(([key, entry]) => (
        <div key={key} data-series={key} data-label={entry.label}>
          {values?.[key]}
        </div>
      ))}
    </dl>
  ),
}));

let captured: { data: Record<string, unknown>[]; config: unknown } | null =
  null;
vi.mock("../dither-kit/bar-chart", () => ({
  BarChart: ({
    data,
    config,
    children,
  }: {
    data: Record<string, unknown>[];
    config: unknown;
    children?: React.ReactNode;
  }) => {
    captured = { data, config };
    return <div data-testid="chart">{children}</div>;
  },
}));

// Static imports: Vitest hoists `vi.mock` above them, so the charts already
// receive the stubs above.
import { durationRows, RunDurationChart } from "./RunDurationChart";
import { outcomeRows, RunOutcomeChart } from "./RunOutcomeChart";

const EN: Lang = "en";

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
    const rows = outcomeRows(
      [run({ stats: { new: 5, merged: 2, rejected: 1, published: 2 } })],
      EN
    );
    expect(rows[0]).toMatchObject({ new: 5, merged: 2, rejected: 1 });
  });

  it("orders oldest to newest even though the endpoint returns newest-first", () => {
    const rows = outcomeRows(
      [
        run({ id: "newest", started_at: 200 }),
        run({ id: "oldest", started_at: 100 }),
      ],
      EN
    );
    expect(rows.map((r) => r.id)).toEqual(["oldest", "newest"]);
  });

  it("falls back to items_new when the row predates the stats column", () => {
    const rows = outcomeRows([run({ items_new: 9, stats: null })], EN);
    // Honest values, not invented: merged/rejected have no legacy column.
    expect(rows[0]).toMatchObject({ new: 9, merged: 0, rejected: 0 });
  });

  it("keeps a row whose stats exist but carry no outcome counts", () => {
    const rows = outcomeRows([run({ stats: { tokens: 100 } })], EN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ new: 5, merged: 0, rejected: 0 });
  });
});

describe("durationRows", () => {
  it("plots finished runs as seconds", () => {
    expect(durationRows([run()], EN)[0].seconds).toBe(157);
  });

  it("drops a run that never finished instead of charting it as zero", () => {
    const rows = durationRows(
      [run({ id: "done" }), run({ id: "in-flight", finished_at: null })],
      EN
    );
    expect(rows.map((r) => r.id)).toEqual(["done"]);
  });

  it("keeps a same-second run as a real zero, not a dropped point", () => {
    const rows = durationRows([run({ finished_at: 1_700_000_000 })], EN);
    expect(rows).toHaveLength(1);
    expect(rows[0].seconds).toBe(0);
  });

  it("degrades a missing timestamp instead of printing Invalid Date", () => {
    // Outcomes keeps the row (it still has counts to plot), so it is that
    // chart which has to degrade the labels rather than the axis.
    const rows = outcomeRows([run({ started_at: null, items_new: 3 })], EN);
    expect(rows[0].label).toBe("—");
    expect(rows[0].at).toBe("—");

    // Duration has nothing to plot without a timestamp, so it drops the row.
    expect(durationRows([run({ started_at: null })], EN)).toEqual([]);
  });
});

describe("run charts", () => {
  it("hands the outcome chart non-zero stacked series", () => {
    render(
      <RunOutcomeChart
        runs={[run({ stats: { new: 5, merged: 1, rejected: 0 } })]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    // The regression: the old bars rendered from these same numbers and
    // collapsed to 0 height, so the card read as permanently empty.
    expect(captured?.data[0]).toMatchObject({ new: 5, merged: 1, rejected: 0 });
  });

  it("keeps every row key present in the chart config", () => {
    // SERIES is derived from CONFIG precisely so a renamed series cannot
    // silently vanish from the stack — this asserts the two still agree.
    render(
      <RunOutcomeChart
        runs={[run({ stats: { new: 1, merged: 1, rejected: 1 } })]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    const config = captured?.config as Record<string, unknown>;
    for (const key of Object.keys(captured?.data[0] ?? {})) {
      if (key === "id" || key === "at" || key === "label") continue;
      expect(config, key).toHaveProperty(key);
    }
  });

  it("shows the window totals for each outcome series", () => {
    render(
      <RunOutcomeChart
        runs={[
          run({ id: "a", stats: { new: 5, merged: 1, rejected: 2 } }),
          run({ id: "b", stats: { new: 3, merged: 0, rejected: 1 } }),
        ]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    const series = (key: string) =>
      screen.getByTestId("legend").querySelector(`[data-series="${key}"]`)
        ?.textContent;
    expect(series("new")).toBe("8");
    expect(series("merged")).toBe("1");
    expect(series("rejected")).toBe("3");
  });

  it("labels each legend entry", () => {
    render(
      <RunOutcomeChart
        runs={[run({ stats: { new: 1, merged: 1, rejected: 1 } })]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    const labelOf = (key: string) =>
      screen
        .getByTestId("legend")
        .querySelector(`[data-series="${key}"]`)
        ?.getAttribute("data-label");
    expect(labelOf("new")).toBe("New");
    expect(labelOf("merged")).toBe("Merged");
    expect(labelOf("rejected")).toBe("Rejected");
  });

  it("falls back to the empty label only when there is genuinely nothing", () => {
    const { rerender } = render(
      <RunOutcomeChart
        runs={[run({ items_new: 0, stats: null })]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    expect(screen.getByText("No data yet.")).toBeTruthy();

    rerender(
      <RunOutcomeChart
        runs={[run({ items_new: 1, stats: null })]}
        emptyLabel="No data yet."
        lang={EN}
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
        lang={EN}
      />
    );
    // Asserted by value, not by <dt>/<dd> adjacency: a wrapper element
    // between them would silently turn an adjacency check into a pass.
    expect(screen.getByText("90s")).toBeTruthy();
    expect(screen.getByText("120s")).toBeTruthy();
    expect(screen.getByText("3m")).toBeTruthy();
  });

  it("never rounds a sub-minute duration total up to a bare 0m", () => {
    render(
      <RunDurationChart
        runs={[run({ started_at: 100, finished_at: 120 })]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    // avg, peak and total are all 20s here, so match them as a group.
    expect(screen.getAllByText("20s")).toHaveLength(3);
    expect(screen.queryByText("0m")).toBeNull();
  });

  it("states the empty label when no run ever finished", () => {
    render(
      <RunDurationChart
        runs={[run({ finished_at: null })]}
        emptyLabel="No data yet."
        lang={EN}
      />
    );
    expect(screen.getByText("No data yet.")).toBeTruthy();
  });
});
