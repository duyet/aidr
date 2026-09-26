import type { WorkflowRunRow } from "../../lib/system-queries";
import { Bar } from "../dither-kit/bar";
import { BarChart } from "../dither-kit/bar-chart";
import type { ChartConfig } from "../dither-kit/chart-context";
import { Grid } from "../dither-kit/grid";
import { Tooltip } from "../dither-kit/tooltip";
import { XAxis } from "../dither-kit/x-axis";
import { YAxis } from "../dither-kit/y-axis";
import { formatDurationSec, runAxisHeading, runAxisTime } from "./run-format";

interface RunDurationChartProps {
  runs: WorkflowRunRow[];
  emptyLabel: string;
}

const CONFIG: ChartConfig = {
  seconds: { label: "Duration", color: "blue" },
};

/** Runs that never finished have no duration to plot; a run that finished in
 *  the same second it started is a real (if tiny) 0s data point, so only a
 *  missing timestamp drops the row. */
function durationOf(run: WorkflowRunRow): number | null {
  if (!run.started_at || !run.finished_at) return null;
  return formatDurationSec(run.started_at, run.finished_at);
}

export interface DurationRow {
  id: string;
  /** Tooltip heading. */
  at: string;
  /** x-axis tick. */
  label: string;
  seconds: number;
}

/** Per-run duration series, oldest first, dropping runs that never finished. */
export function durationRows(runs: WorkflowRunRow[]): DurationRow[] {
  // The endpoint returns newest-first; charts read oldest → newest.
  return [...runs]
    .reverse()
    .map((run) => ({
      id: run.id,
      at: runAxisHeading(run.started_at),
      label: runAxisTime(run.started_at),
      seconds: durationOf(run),
    }))
    .filter((row): row is DurationRow => row.seconds !== null);
}

/**
 * Bar chart of run duration, oldest to newest, on the shared dither canvas.
 *
 * The previous hand-rolled version nested a percentage `height` inside a
 * flex item of `height: auto`, which resolved to 0 — the card read as empty.
 * `BarChart` measures the plot itself, so the bars always have real geometry,
 * and the axes/tooltip make a 3-minute outlier legible at a glance.
 */
export function RunDurationChart({ runs, emptyLabel }: RunDurationChartProps) {
  const rows = durationRows(runs);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  const avg = total / rows.length;
  const peak = rows.reduce((a, b) => (b.seconds > a.seconds ? b : a));

  return (
    <div className="space-y-2">
      <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
        {(
          [
            ["avg", `${Math.round(avg)}s`],
            ["peak", `${peak.seconds}s`],
            ["total", `${Math.round(total / 60)}m`],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <BarChart data={rows} config={CONFIG} className="h-36 w-full">
        <Grid />
        <XAxis dataKey="label" maxTicks={4} />
        <YAxis
          tickFormatter={(v) => (v >= 60 ? `${Math.round(v / 60)}m` : `${v}s`)}
        />
        <Bar dataKey="seconds" />
        <Tooltip labelKey="at" valueFormatter={(v) => `${Math.round(v)}s`} />
      </BarChart>
    </div>
  );
}
