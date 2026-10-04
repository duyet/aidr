import { Badge } from "@aidr/ui";
import { useMemo, useState } from "react";
import type {
  DayCount,
  LlmDayTaskCount,
  NamedCount,
} from "../../lib/system-queries";
import { Bar } from "../dither-kit/bar";
import { BarChart } from "../dither-kit/bar-chart";
import type { ChartConfig } from "../dither-kit/chart-context";
import { Grid } from "../dither-kit/grid";
import { Legend } from "../dither-kit/legend";
import { type DitherColor, rgb, seedOfColor } from "../dither-kit/palette";
import { Pie } from "../dither-kit/pie";
import { PieChart } from "../dither-kit/pie-chart";
import { Tooltip } from "../dither-kit/tooltip";
import { XAxis } from "../dither-kit/x-axis";
import { YAxis } from "../dither-kit/y-axis";
import {
  amountsForDate,
  buildTokenBurn,
  chartDayLabel,
  dateAtHover,
} from "./token-burn";

function EmptyNote({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

/** Dithered bar chart of stories published per day. */
export function ItemsAreaChart({
  data,
  emptyLabel,
}: {
  data: DayCount[];
  emptyLabel: string;
}) {
  if (data.length === 0) return <EmptyNote label={emptyLabel} />;
  const rows = data.map((d) => ({
    day: chartDayLabel(d.date),
    date: d.date,
    items: d.count,
  }));
  const config: ChartConfig = {
    items: { label: "Items", color: "green" },
  };
  return (
    <BarChart data={rows} config={config} className="h-44 w-full">
      <Grid />
      <XAxis dataKey="day" />
      <YAxis />
      <Bar dataKey="items" />
      <Tooltip labelKey="date" showTotal />
    </BarChart>
  );
}

/** Back-compat alias: Items per day is now a bar chart. */
export const ItemsBarChart = ItemsAreaChart;

/** One daily series with the axis label that series actually has. The
 *  pipeline charts above are hardcoded to their own metrics, so audience
 *  charts (page views, active users, signups) get a generic version instead
 *  of inheriting an "Items" legend that would be wrong. */
export function DailyMetricChart({
  data,
  seriesKey,
  label,
  color = "blue",
  emptyLabel,
}: {
  data: DayCount[];
  seriesKey: string;
  label: string;
  color?: DitherColor;
  emptyLabel: string;
}) {
  const points = Array.isArray(data) ? data : [];
  if (points.length === 0) return <EmptyNote label={emptyLabel} />;
  const rows = points.map((d) => ({
    day: chartDayLabel(d?.date),
    date: d?.date ?? "—",
    [seriesKey]: d?.count ?? 0,
  }));
  const config: ChartConfig = {
    [seriesKey]: { label, color },
  };
  return (
    <BarChart data={rows} config={config} className="h-44 w-full">
      <Grid />
      <XAxis dataKey="day" />
      <YAxis />
      <Bar dataKey={seriesKey} />
      <Tooltip labelKey="date" showTotal />
    </BarChart>
  );
}

/** Dithered bar chart of LLM tokens spent per day. */
export function TokensLineChart({
  data,
  emptyLabel,
  formatValue,
}: {
  data: DayCount[];
  emptyLabel: string;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return <EmptyNote label={emptyLabel} />;
  const rows = data.map((d) => ({
    day: chartDayLabel(d.date),
    date: d.date,
    tokens: d.count,
  }));
  const config: ChartConfig = {
    tokens: { label: "Tokens", color: "purple" },
  };
  return (
    <BarChart data={rows} config={config} className="h-44 w-full">
      <Grid />
      <XAxis dataKey="day" />
      <YAxis tickFormatter={formatValue} />
      <Bar dataKey="tokens" />
      <Tooltip labelKey="date" showTotal />
    </BarChart>
  );
}

export const TokensBarChart = TokensLineChart;

const SERIES_COLORS: DitherColor[] = [
  "purple",
  "blue",
  "green",
  "orange",
  "pink",
  "red",
  "grey",
];

const TASK_BURN_COLORS: Record<string, DitherColor> = {
  score: "purple",
  translate: "blue",
  tldr: "green",
  cluster: "orange",
  review: "pink",
  mail: "red",
  other: "grey",
};

function burnColor(name: string, series: string[]): DitherColor {
  return (
    TASK_BURN_COLORS[name] ??
    SERIES_COLORS[series.indexOf(name) % SERIES_COLORS.length] ??
    "grey"
  );
}

/** Stacked dither bars of LLM tokens per day by task, with call metrics. */
export function TokenBurnSection({
  data,
  emptyLabel,
  formatValue,
  seriesNoun = "task",
}: {
  data: LlmDayTaskCount[];
  emptyLabel: string;
  formatValue?: (n: number) => string;
  /** What each stacked series is. "model" changes the summary badge. */
  seriesNoun?: "task" | "model";
}) {
  const view = useMemo(() => buildTokenBurn(data), [data]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (!view) return <EmptyNote label={emptyLabel} />;
  const fmt = formatValue ?? String;
  const hoverDate = dateAtHover(view, hoverIndex);
  const amounts = amountsForDate(view, hoverDate);
  const rows = view.days.map((day) => ({
    day: day.day,
    date: day.date,
    ...day.values,
  }));
  const peak = view.days.reduce((best, day) =>
    day.total > best.total ? day : best
  );
  const top = view.series
    .map((name) => [name, view.totals[name] ?? 0] as const)
    .sort((a, b) => b[1] - a[1])[0];

  const config: ChartConfig = Object.fromEntries(
    view.series.map((name) => [
      name,
      { label: name, color: burnColor(name, view.series) },
    ])
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["tokens", fmt(view.total)],
            ["calls", String(view.calls)],
            ["failures", String(view.failures)],
            [
              "avg/day",
              fmt(Math.round(view.total / Math.max(view.days.length, 1))),
            ],
            ["peak", `${fmt(peak.total)} ${peak.date}`],
            [
              seriesNoun === "model" ? "top model" : "top task",
              top
                ? `${top[0]} ${Math.round((top[1] / Math.max(view.total, 1)) * 100)}%`
                : "—",
            ],
          ] as const
        ).map(([label, value]) => (
          <Badge key={label} variant="secondary" className="font-normal">
            {label}{" "}
            <span className="ml-1 font-mono tabular-nums text-foreground">
              {value}
            </span>
          </Badge>
        ))}
      </div>

      <BarChart
        data={rows}
        config={config}
        stackType="stacked"
        className="h-52 w-full"
        onHoverChange={setHoverIndex}
      >
        <Grid />
        <XAxis dataKey="day" />
        <YAxis tickFormatter={formatValue} />
        {view.series.map((name) => (
          <Bar key={name} dataKey={name} />
        ))}
        <Tooltip labelKey="date" showTotal valueFormatter={(n) => fmt(n)} />
      </BarChart>

      <div className="space-y-1.5">
        <p
          className={`font-mono text-xs ${hoverDate ? "text-foreground" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {hoverDate ?? "Last 14 days"}
        </p>
        <dl className="divide-y divide-border text-sm">
          {view.series.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0"
            >
              <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 shrink-0 rounded-[1px]"
                  style={{
                    backgroundColor: rgb(
                      seedOfColor(burnColor(name, view.series)).fill
                    ),
                  }}
                  aria-hidden
                />
                <span className="break-words">{name}</span>
              </dt>
              <dd className="font-mono tabular-nums text-foreground">
                {fmt(amounts[name] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

const PIE_COLORS: DitherColor[] = [
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "red",
];

/** Dithered donut of story share by category (top slices). */
export function CategoryDonut({
  data,
  emptyLabel,
}: {
  data: NamedCount[];
  emptyLabel: string;
}) {
  if (data.length === 0) return <EmptyNote label={emptyLabel} />;
  const top = data.slice(0, PIE_COLORS.length);
  const config: ChartConfig = Object.fromEntries(
    top.map((d, i) => [d.name, { label: d.name, color: PIE_COLORS[i] }])
  );
  return (
    <PieChart
      data={top}
      config={config}
      dataKey="count"
      nameKey="name"
      innerRadius={0.55}
      className="h-52 w-full"
    >
      <Pie />
      <Legend />
      <Tooltip />
    </PieChart>
  );
}
