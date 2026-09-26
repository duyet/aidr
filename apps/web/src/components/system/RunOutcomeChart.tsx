import type { WorkflowRunRow } from "../../lib/system-queries";
import { Bar } from "../dither-kit/bar";
import { BarChart } from "../dither-kit/bar-chart";
import { BlockLegend } from "../dither-kit/block-legend";
import type { ChartConfig } from "../dither-kit/chart-context";
import { Grid } from "../dither-kit/grid";
import { Tooltip } from "../dither-kit/tooltip";
import { XAxis } from "../dither-kit/x-axis";
import { YAxis } from "../dither-kit/y-axis";
import { runAxisHeading, runAxisTime } from "./run-format";

interface RunOutcomeChartProps {
  runs: WorkflowRunRow[];
  emptyLabel: string;
}

const CONFIG: ChartConfig = {
  new: { label: "New", color: "green" },
  merged: { label: "Merged", color: "blue" },
  rejected: { label: "Rejected", color: "red" },
};

const SERIES = ["new", "merged", "rejected"] as const;

export interface OutcomeRow {
  id: string;
  /** Tooltip heading. */
  at: string;
  /** x-axis tick. */
  label: string;
  new: number;
  merged: number;
  rejected: number;
}

/** Per-run outcome series, oldest first.
 *
 * `items_new` is the fallback for pre-migration-0012 rows that have no `stats`
 * JSON; `merged`/`rejected` have no such column and stay 0 there — an honest
 * zero rather than an invented number. */
export function outcomeRows(runs: WorkflowRunRow[]): OutcomeRow[] {
  // The endpoint returns newest-first; charts read oldest → newest.
  return [...runs].reverse().map((run) => ({
    id: run.id,
    at: runAxisHeading(run.started_at),
    label: runAxisTime(run.started_at),
    new: run.stats?.new ?? run.items_new ?? 0,
    merged: run.stats?.merged ?? 0,
    rejected: run.stats?.rejected ?? 0,
  }));
}

/**
 * Stacked bar chart of new / merged / rejected items per run, oldest to newest.
 *
 * Replaces a hand-rolled stack whose percentage heights were nested inside a
 * `height: auto` flex item, so every bar resolved to 0 and the card looked
 * permanently empty. `BarChart` owns the plot geometry, so the stack scales
 * correctly and the per-run split is legible.
 */
export function RunOutcomeChart({ runs, emptyLabel }: RunOutcomeChartProps) {
  const rows = outcomeRows(runs);

  const totals = rows.reduce(
    (acc, row) => {
      for (const key of SERIES) acc[key] += row[key];
      return acc;
    },
    { new: 0, merged: 0, rejected: 0 }
  );

  if (rows.length === 0 || SERIES.every((key) => totals[key] === 0)) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      <BarChart
        data={rows}
        config={CONFIG}
        stackType="stacked"
        className="h-36 w-full"
      >
        <Grid />
        <XAxis dataKey="label" maxTicks={4} />
        <YAxis />
        {SERIES.map((key) => (
          <Bar key={key} dataKey={key} />
        ))}
        <Tooltip labelKey="at" />
      </BarChart>
      {/* In-flow, with window totals: the overlay <Legend> would sit on top of
          the plot, and the totals are the number operators actually want. */}
      <BlockLegend config={CONFIG} values={totals} />
    </div>
  );
}
