import { cn } from "@aidr/libs/utils";
import { TabsContent } from "@aidr/ui";
import {
  ArrowDown,
  ArrowUp,
  Cpu,
  Flame,
  Newspaper,
  Pin,
  PinOff,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import {
  COMPARE_WINDOW_DAYS,
  MAX_TRACKED,
  rankModels,
  risers,
  type SystemTrends,
  type TrendSeries,
  trendInsights,
  type WindowStat,
  windowStat,
} from "../../lib/trends";
import { useSystemData } from "../../lib/use-system-stats";
import { Sparkline } from "../dither-kit/sparkline";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { StatTile, StatTileSkeleton } from "./StatTile";
import { TrendTracker } from "./TrendTracker";
import { TAB_PANEL } from "./tab-spacing";

export interface TrackProps {
  track: string[];
  onTrackChange: (next: string[]) => void;
}

const WINDOW_LABEL = `last ${COMPARE_WINDOW_DAYS} full days vs the ${COMPARE_WINDOW_DAYS} before`;

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function InsightRow({ trends }: { trends: SystemTrends }) {
  const { biggestRiser, newEntrant, topModel, volume } = trendInsights(trends);
  return (
    <>
      <StatTile
        icon={Flame}
        label="Biggest riser"
        value={biggestRiser?.name ?? "None"}
        numeric={false}
        sublabel={
          biggestRiser
            ? `${signed(biggestRiser.delta)} mentions (${biggestRiser.prior} → ${biggestRiser.current})`
            : "No tag grew this week"
        }
      />
      <StatTile
        icon={Sparkles}
        label="New entrant"
        value={newEntrant?.name ?? "None"}
        numeric={false}
        sublabel={
          newEntrant
            ? `${newEntrant.current} mentions, first seen this week`
            : "No new tag cleared the bar"
        }
      />
      <StatTile
        icon={Cpu}
        label="Most-mentioned model"
        value={topModel?.name ?? "None"}
        numeric={false}
        sublabel={
          topModel
            ? `${topModel.current} mentions (${signed(topModel.delta)})`
            : "No model mentions yet"
        }
      />
      <StatTile
        icon={Newspaper}
        label="Published stories"
        value={volume.current.toLocaleString("en-US")}
        sublabel={
          volume.changePct === null
            ? "No prior week to compare"
            : `${signed(volume.changePct)}% vs prior ${COMPARE_WINDOW_DAYS} days`
        }
      />
    </>
  );
}

function PinButton({
  name,
  track,
  onTrackChange,
}: { name: string } & TrackProps) {
  const pinned = track.includes(name);
  const full = !pinned && track.length >= MAX_TRACKED;
  const Icon = pinned ? PinOff : Pin;
  return (
    <button
      type="button"
      disabled={full}
      aria-pressed={pinned}
      aria-label={pinned ? `Stop tracking ${name}` : `Track ${name}`}
      title={full ? `Up to ${MAX_TRACKED} tracked` : undefined}
      onClick={() =>
        onTrackChange(
          pinned ? track.filter((t) => t !== name) : [...track, name]
        )
      }
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
        pinned && "text-accent"
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

function Delta({ stat }: { stat: WindowStat }) {
  if (stat.isNew) {
    return (
      <span className="font-mono text-[11px] font-medium text-accent">new</span>
    );
  }
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {signed(stat.delta)}
    </span>
  );
}

function SeriesRow({
  series,
  stat,
  lead,
  ...track
}: {
  series: TrendSeries;
  stat: WindowStat;
  lead?: ReactNode;
} & TrackProps) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      {lead}
      <span
        className="min-w-0 flex-1 truncate text-sm text-foreground"
        title={series.name}
      >
        {series.name}
      </span>
      <Sparkline
        data={series.counts}
        color={series.kind === "model" ? "purple" : "green"}
        className={cn("h-6 w-20 shrink-0", lead && "hidden sm:block")}
      />
      <span className="w-8 text-right font-mono text-sm tabular-nums text-foreground">
        {stat.current}
      </span>
      <span className="w-9 text-right">
        <Delta stat={stat} />
      </span>
      <PinButton name={series.name} {...track} />
    </li>
  );
}

function RisersCard({
  title,
  kind,
  ...track
}: { title: string; kind: "topic" | "model" } & TrackProps) {
  const state = useSystemData<SystemTrends>(API.trends);
  return (
    <ChartCard title={title} subtitle={`Largest gain, ${WINDOW_LABEL}`}>
      <CardData state={state} skeleton={<CardSkeleton />}>
        {(t) => {
          const rows = risers(t.series, kind);
          if (rows.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                Nothing grew this week.
              </p>
            );
          }
          const byName = new Map(t.series.map((s) => [s.name, s]));
          return (
            <ul className="divide-y divide-border/60">
              {rows.map((stat) => {
                const series = byName.get(stat.name);
                return series ? (
                  <SeriesRow
                    key={stat.name}
                    series={series}
                    stat={stat}
                    {...track}
                  />
                ) : null;
              })}
            </ul>
          );
        }}
      </CardData>
    </ChartCard>
  );
}

function RankShift({
  rank,
  priorRank,
}: {
  rank: number;
  priorRank: number | null;
}) {
  const label =
    priorRank === null
      ? "new this week"
      : priorRank === rank
        ? "same rank"
        : `was #${priorRank}`;
  const up = priorRank !== null && priorRank > rank;
  const down = priorRank !== null && priorRank < rank;
  return (
    <span
      className="flex w-12 shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-muted-foreground"
      title={label}
    >
      <span className="text-foreground">#{rank}</span>
      {up ? (
        <ArrowUp className="size-3 text-accent" aria-label={label} />
      ) : null}
      {down ? <ArrowDown className="size-3" aria-label={label} /> : null}
    </span>
  );
}

function ModelLeaderboard(track: TrackProps) {
  const state = useSystemData<SystemTrends>(API.trends);
  return (
    <ChartCard
      title="AI models in the news"
      subtitle={`Versioned model names in story tags, ranked over the ${WINDOW_LABEL}`}
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(t) => {
          const ranked = rankModels(t.series).slice(0, 12);
          if (ranked.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                No model mentions this week.
              </p>
            );
          }
          const byName = new Map(t.series.map((s) => [s.name, s]));
          return (
            <ul className="grid grid-cols-1 gap-x-8 divide-y divide-border/60 md:grid-cols-2 md:divide-y-0">
              {ranked.map((stat) => {
                const series = byName.get(stat.name);
                return series ? (
                  <SeriesRow
                    key={stat.name}
                    series={series}
                    stat={stat}
                    lead={
                      <RankShift rank={stat.rank} priorRank={stat.priorRank} />
                    }
                    {...track}
                  />
                ) : null;
              })}
            </ul>
          );
        }}
      </CardData>
    </ChartCard>
  );
}

function CategoryMultiples() {
  const state = useSystemData<SystemTrends>(API.trends);
  return (
    <ChartCard
      title="Categories over time"
      subtitle="Published stories per day, 28 days. Each panel has its own scale."
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(t) => {
          const categories = t.series.filter((s) => s.kind === "category");
          if (categories.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                No published stories yet.
              </p>
            );
          }
          return (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {categories.map((series) => {
                const stat = windowStat(series);
                return (
                  <li
                    key={series.name}
                    className="rounded-lg border border-border/60 p-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {series.name}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {stat.current}
                        <span className="ml-1">({signed(stat.delta)})</span>
                      </span>
                    </div>
                    <Sparkline
                      data={series.counts}
                      color="blue"
                      className="mt-1.5 h-10 w-full"
                    />
                  </li>
                );
              })}
            </ul>
          );
        }}
      </CardData>
    </ChartCard>
  );
}

function Insights() {
  const state = useSystemData<SystemTrends>(API.trends);
  const skeleton = useMemo(
    () => [0, 1, 2, 3].map((i) => <StatTileSkeleton key={i} />),
    []
  );
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CardData state={state} skeleton={skeleton}>
        {(t) => <InsightRow trends={t} />}
      </CardData>
    </div>
  );
}

export function TrendsTab(track: TrackProps) {
  return (
    <TabsContent value="trends" className={TAB_PANEL}>
      <div className="space-y-3">
        <Insights />
        <TrendTracker {...track} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <RisersCard title="Rising topics" kind="topic" {...track} />
          <RisersCard title="Rising models" kind="model" {...track} />
          <ModelLeaderboard {...track} />
          <CategoryMultiples />
        </div>
      </div>
    </TabsContent>
  );
}
