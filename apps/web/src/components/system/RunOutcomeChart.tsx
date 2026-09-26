import type { WorkflowRunRow } from "../../lib/system-queries";
import type { Lang } from "../../lib/types";
import { Bar } from "../dither-kit/bar";
import { BarChart } from "../dither-kit/bar-chart";
import { BlockLegend } from "../dither-kit/block-legend";
import { Grid } from "../dither-kit/grid";
import type { DitherColor } from "../dither-kit/palette";
import { Tooltip } from "../dither-kit/tooltip";
import { XAxis } from "../dither-kit/x-axis";
import { YAxis } from "../dither-kit/y-axis";
import { runAxisHeading, runAxisTime } from "./run-format";

interface RunOutcomeChartProps {
  runs: WorkflowRunRow[];
  emptyLabel: string;
  lang: Lang;
}

/** The stacked outcome series. Typing CONFIG against this union is what keeps
 *  the two in step: a series added to one and not the other is a compile
 *  error, not a bar that silently fails to render (`Bar` returns null for a
 *  dataKey missing from the config, and stack order follows
 *  `Object.keys(CONFIG)`, not JSX order). */
type SeriesKey = "new" | "merged" | "rejected";

const CONFIG: Record<SeriesKey, { label: string; color: DitherColor }> = {
  new: { label: "New", color: "green" },
  merged: { label: "Merged", color: "blue" },
  rejected: { label: "Rejected", color: "red" },
};

const SERIES = Object.keys(CONFIG) as SeriesKey[];

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
export function outcomeRows(runs: WorkflowRunRow[], lang: Lang): OutcomeRow[] {
  // The endpoint returns newest-first; charts read oldest → newest.
  return [...runs].reverse().map((run) => ({
    id: run.id,
    at: runAxisHeading(run.started_at, lang),
    label: runAxisTime(run.started_at, lang),
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
export function RunOutcomeChart({
  runs,
  emptyLabel,
  lang,
}: RunOutcomeChartProps) {
  const rows = outcomeRows(runs, lang);

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
