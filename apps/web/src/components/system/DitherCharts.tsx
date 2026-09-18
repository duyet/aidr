import { Badge } from "@aidr/ui";
import type {
  DayCount,
  LlmDayTaskCount,
  NamedCount,
} from "../../lib/system-queries";
import { Area, Line } from "../dither-kit/area";
import { AreaChart, LineChart } from "../dither-kit/area-chart";
import { Bar } from "../dither-kit/bar";
import { BarChart } from "../dither-kit/bar-chart";
import type { ChartConfig } from "../dither-kit/chart-context";
import { Grid } from "../dither-kit/grid";
import { Legend } from "../dither-kit/legend";
import type { DitherColor } from "../dither-kit/palette";
import { Pie } from "../dither-kit/pie";
import { PieChart } from "../dither-kit/pie-chart";
import { Tooltip } from "../dither-kit/tooltip";
import { XAxis } from "../dither-kit/x-axis";
import { YAxis } from "../dither-kit/y-axis";

const shortDay = (date: string) => date.slice(5); // YYYY-MM-DD -> MM-DD

function EmptyNote({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

/** Dithered area chart of stories published per day. */
export function ItemsAreaChart({
  data,
  emptyLabel,
}: {
  data: DayCount[];
  emptyLabel: string;
}) {
  if (data.length === 0) return <EmptyNote label={emptyLabel} />;
  const rows = data.map((d) => ({ day: shortDay(d.date), items: d.count }));
  const config: ChartConfig = {
    items: { label: "Items", color: "green" },
  };
  return (
    <AreaChart data={rows} config={config} className="h-44 w-full">
      <Grid />
      <XAxis dataKey="day" />
      <YAxis />
      <Area dataKey="items" />
      <Tooltip />
    </AreaChart>
  );
}

/** Dithered line chart of LLM tokens spent per day. */
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
  const rows = data.map((d) => ({ day: shortDay(d.date), tokens: d.count }));
  const config: ChartConfig = {
    tokens: { label: "Tokens", color: "purple" },
  };
  return (
    <LineChart data={rows} config={config} className="h-44 w-full">
      <Grid />
      <XAxis dataKey="day" />
      <YAxis tickFormatter={formatValue} />
      <Line dataKey="tokens" />
      <Tooltip />
    </LineChart>
  );
}

const TASK_BURN_COLORS: Record<string, DitherColor> = {
  score: "purple",
  translate: "blue",
  tldr: "green",
  cluster: "orange",
  review: "pink",
  mail: "red",
  other: "grey",
};

/** Stacked dither bars of LLM tokens per day by task, with call metrics. */
export function TokenBurnSection({
  data,
  emptyLabel,
  formatValue,
}: {
  data: LlmDayTaskCount[];
  emptyLabel: string;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return <EmptyNote label={emptyLabel} />;
  const fmt = formatValue ?? String;
  const tasks = [...new Set(data.map((r) => r.task))].sort();

  const tokensByDate = new Map<string, Map<string, number>>();
  let calls = 0;
  let failures = 0;
  const tokensByTask = new Map<string, number>();
  for (const row of data) {
    calls += row.calls;
    failures += row.failures;
    tokensByTask.set(row.task, (tokensByTask.get(row.task) ?? 0) + row.tokens);
    const day = tokensByDate.get(row.date) ?? new Map<string, number>();
    day.set(row.task, (day.get(row.task) ?? 0) + row.tokens);
    tokensByDate.set(row.date, day);
  }
  const dates = [...tokensByDate.keys()].sort();
  const rows = dates.map((date) => {
    const day = tokensByDate.get(date) ?? new Map<string, number>();
    const entry: Record<string, string | number> = { day: shortDay(date) };
    for (const task of tasks) entry[task] = day.get(task) ?? 0;
    return entry;
  });
  const dayTotals = dates.map((date) =>
    tasks.reduce((sum, t) => sum + (tokensByDate.get(date)?.get(t) ?? 0), 0)
  );
  const total = dayTotals.reduce((sum, n) => sum + n, 0);
  const peakIdx = dayTotals.indexOf(Math.max(...dayTotals, 0));
  const topTask = [...tokensByTask.entries()].sort((a, b) => b[1] - a[1])[0];

  const config: ChartConfig = Object.fromEntries(
    tasks.map((task) => [
      task,
      { label: task, color: TASK_BURN_COLORS[task] ?? "grey" },
    ])
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["tokens", fmt(total)],
            ["calls", String(calls)],
            ["failures", String(failures)],
            ["avg/day", fmt(Math.round(total / Math.max(dates.length, 1)))],
            [
              "peak",
              peakIdx >= 0
                ? `${fmt(dayTotals[peakIdx] ?? 0)} ${dates[peakIdx] ?? ""}`
                : "—",
            ],
            [
              "top task",
              topTask
                ? `${topTask[0]} ${Math.round((topTask[1] / Math.max(total, 1)) * 100)}%`
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
      >
        <Grid />
        <XAxis dataKey="day" />
        <YAxis tickFormatter={formatValue} />
        {tasks.map((task) => (
          <Bar key={task} dataKey={task} />
        ))}
        <Tooltip />
        <Legend />
      </BarChart>

      <dl className="divide-y divide-border text-sm">
        {tasks.map((task) => (
          <div
            key={task}
            className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0"
          >
            <dt className="text-muted-foreground">{task}</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {fmt(tokensByTask.get(task) ?? 0)}
            </dd>
          </div>
        ))}
      </dl>
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
