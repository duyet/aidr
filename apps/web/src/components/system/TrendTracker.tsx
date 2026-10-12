import { Input } from "@aidr/ui";
import { Plus, X } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import {
  canonicalTrendName,
  MAX_TRACKED,
  type SystemTrends,
  windowStat,
} from "../../lib/trends";
import { useSystemData } from "../../lib/use-system-stats";
import { Line } from "../dither-kit/area";
import { LineChart } from "../dither-kit/area-chart";
import { BlockLegend } from "../dither-kit/block-legend";
import type { ChartConfig } from "../dither-kit/chart-context";
import { Grid } from "../dither-kit/grid";
import { type DitherColor, rgb, seedOfColor } from "../dither-kit/palette";
import { Tooltip } from "../dither-kit/tooltip";
import { XAxis } from "../dither-kit/x-axis";
import { YAxis } from "../dither-kit/y-axis";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import type { TrackProps } from "./TrendsTab";
import { chartDayLabel } from "./token-burn";

/** Color slot follows pin order, so the URL alone reproduces the colors. */
export const TRACK_COLORS: readonly DitherColor[] = [
  "blue",
  "orange",
  "green",
  "pink",
  "purple",
  "red",
];

function TrackChart({
  trends,
  names,
}: {
  trends: SystemTrends;
  names: string[];
}) {
  const byName = new Map(trends.series.map((s) => [s.name, s]));
  const config: ChartConfig = {};
  names.forEach((name, i) => {
    config[`s${i}`] = { label: name, color: TRACK_COLORS[i] };
  });
  const rows = trends.days.map((date, d) => {
    const row: Record<string, string | number> = {
      day: chartDayLabel(date),
      date,
    };
    names.forEach((name, i) => {
      row[`s${i}`] = byName.get(name)?.counts[d] ?? 0;
    });
    return row;
  });
  return (
    <div className="space-y-2">
      <LineChart
        data={rows}
        config={config}
        animate={false}
        className="h-56 w-full"
      >
        <Grid />
        <XAxis dataKey="day" />
        <YAxis />
        {names.map((name, i) => (
          <Line key={name} dataKey={`s${i}`} />
        ))}
        <Tooltip labelKey="date" />
      </LineChart>
      <BlockLegend config={config} />
    </div>
  );
}

function Chips({ track, onTrackChange }: TrackProps) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {track.map((name, i) => (
        <li key={name}>
          <button
            type="button"
            onClick={() => onTrackChange(track.filter((t) => t !== name))}
            aria-label={`Stop tracking ${name}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className="size-2 rounded-[1px]"
              style={{
                backgroundColor: rgb(seedOfColor(TRACK_COLORS[i]).fill),
              }}
            />
            {name}
            <X className="size-3 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Picker({
  options,
  track,
  onTrackChange,
}: { options: string[] } & TrackProps) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const full = track.length >= MAX_TRACKED;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = canonicalTrendName(draft);
    if (!options.includes(name) || track.includes(name) || full) return;
    onTrackChange([...track, name]);
    setDraft("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <Input
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={
          full ? `Up to ${MAX_TRACKED} tracked` : "Add a topic or model"
        }
        disabled={full}
        aria-label="Add a topic or model to track"
        className="h-8 w-full text-xs sm:w-56"
      />
      <datalist id={listId}>
        {options
          .filter((o) => !track.includes(o))
          .map((o) => (
            <option key={o} value={o} />
          ))}
      </datalist>
      <button
        type="submit"
        disabled={full}
        aria-label="Track"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </form>
  );
}

/** Top movers to offer when nothing is tracked yet. */
function suggestions(trends: SystemTrends): string[] {
  return trends.series
    .filter((s) => s.kind !== "category")
    .map((s) => windowStat(s))
    .sort((a, b) => b.current - a.current)
    .slice(0, 4)
    .map((s) => s.name);
}

export function TrendTracker({ track, onTrackChange }: TrackProps) {
  const state = useSystemData<SystemTrends>(API.trends);
  return (
    <ChartCard
      title="Tracking"
      subtitle="Daily mentions in story tags. Pins live in the URL, so a link shares the view."
    >
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(t) => {
          const options = t.series
            .filter((s) => s.kind !== "category")
            .map((s) => s.name);
          const names = track.filter((n) => options.includes(n));
          return (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Chips track={names} onTrackChange={onTrackChange} />
                <Picker
                  options={options}
                  track={names}
                  onTrackChange={onTrackChange}
                />
              </div>
              {names.length > 0 ? (
                <TrackChart trends={t} names={names} />
              ) : (
                <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <p>Pin a topic or model to see its trend line.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions(t).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => onTrackChange([...names, name])}
                        className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-foreground hover:bg-muted"
                      >
                        + {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }}
      </CardData>
    </ChartCard>
  );
}
