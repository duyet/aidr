import type {
  LlmDayModelCount,
  LlmDayTaskCount,
} from "../../lib/system-queries";
import { tokenBurnModelName } from "./run-format";

export type BurnBy = "task" | "model";

/** Axis tick. The tooltip keeps the full `YYYY-MM-DD` instead. */
export function chartDayLabel(date: string | null | undefined): string {
  return typeof date === "string" && date.length >= 5 ? date.slice(5) : "—";
}

/** Stack By Model rows under the short display name, summing a shared name
 * on the same day (anyrouter/auto and @preset/aidr are both AnyRouter). */
export function modelSeries(rows: LlmDayModelCount[]): LlmDayTaskCount[] {
  const merged = new Map<string, LlmDayTaskCount>();
  for (const row of rows) {
    const task = tokenBurnModelName(row.model);
    const key = `${row.date}\0${task}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        date: row.date,
        task,
        calls: row.calls,
        failures: row.failures,
        tokens: row.tokens,
      });
      continue;
    }
    current.calls += row.calls;
    current.failures += row.failures;
    current.tokens += row.tokens;
  }
  return [...merged.values()];
}

export function rowsForBurn(
  by: BurnBy,
  taskRows: LlmDayTaskCount[],
  modelRows: LlmDayModelCount[] | undefined
): LlmDayTaskCount[] {
  return by === "model" ? modelSeries(modelRows ?? []) : taskRows;
}

export interface TokenBurnDay {
  date: string;
  /** MM-DD tick. The chart tooltip reads `date`. */
  day: string;
  values: Record<string, number>;
  total: number;
}

export interface TokenBurnView {
  series: string[];
  days: TokenBurnDay[];
  calls: number;
  failures: number;
  total: number;
  totals: Record<string, number>;
}

/** One stacked day per date. `total` is the sum of every series in that bucket. */
export function buildTokenBurn(data: LlmDayTaskCount[]): TokenBurnView | null {
  if (data.length === 0) return null;
  const series = [...new Set(data.map((row) => row.task))].sort();
  const byDate = new Map<string, Map<string, number>>();
  let calls = 0;
  let failures = 0;
  const totals: Record<string, number> = {};
  for (const name of series) totals[name] = 0;

  for (const row of data) {
    calls += row.calls;
    failures += row.failures;
    totals[row.task] = (totals[row.task] ?? 0) + row.tokens;
    const day = byDate.get(row.date) ?? new Map<string, number>();
    day.set(row.task, (day.get(row.task) ?? 0) + row.tokens);
    byDate.set(row.date, day);
  }

  const days = [...byDate.keys()].sort().map((date) => {
    const day = byDate.get(date) ?? new Map<string, number>();
    const values: Record<string, number> = {};
    let total = 0;
    for (const name of series) {
      const value = day.get(name) ?? 0;
      values[name] = value;
      total += value;
    }
    return { date, day: chartDayLabel(date), values, total };
  });

  return {
    series,
    days,
    calls,
    failures,
    total: days.reduce((sum, day) => sum + day.total, 0),
    totals,
  };
}

/** The day under the pointer, or null when the pointer has left the chart. */
export function dateAtHover(
  view: TokenBurnView,
  index: number | null
): string | null {
  if (index == null || index < 0 || index >= view.days.length) return null;
  return view.days[index]?.date ?? null;
}

/** Per-series amounts for the table: one day while hovering, otherwise the
 * whole window. */
export function amountsForDate(
  view: TokenBurnView,
  date: string | null
): Record<string, number> {
  if (!date) return view.totals;
  const day = view.days.find((entry) => entry.date === date);
  return day?.values ?? view.totals;
}
