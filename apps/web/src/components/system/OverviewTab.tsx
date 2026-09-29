import { TabsContent } from "@aidr/ui";
import { Activity, Coins, Newspaper, Play, Users } from "lucide-react";
import { formatTokens } from "../../lib/format";
import type { SystemActivity, SystemOverview } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { ItemsAreaChart } from "./DitherCharts";
import { API } from "./endpoints";
import { SignupsTile } from "./SignupsTile";
import { StatTile, StatTileSkeleton } from "./StatTile";
import { TokenBurnCard } from "./TokenBurnCard";
import { TAB_PANEL } from "./tab-spacing";

/** One row of metrics. Signups owns its own endpoint, so it is rendered
 *  outside the overview batch: a failing overview query must not take the
 *  signup total (or the rest of the row) down with it. */
function StatRow({ overview }: { overview: SystemOverview }) {
  return (
    <>
      <StatTile
        icon={Newspaper}
        label="Stories"
        value={String(overview.totals.items)}
        sublabel="all time"
      />
      <StatTile
        icon={Coins}
        label="Tokens"
        value={formatTokens(overview.tokens.total)}
        sublabel={`${overview.tokens.avgPerItem} avg/item`}
      />
      <StatTile
        icon={Play}
        label="Runs today"
        value={String(overview.runsToday)}
        sublabel="UTC day"
      />
      {/* D1 subscribers are email subscriptions, not Clerk accounts. */}
      <StatTile
        icon={Users}
        label="Subscribers"
        value={String(overview.totals.subscribers)}
        sublabel="Email subscriptions"
      />
    </>
  );
}

function StatRowSkeleton() {
  return (
    <>
      <StatTileSkeleton />
      <StatTileSkeleton />
      <StatTileSkeleton />
      <StatTileSkeleton />
    </>
  );
}

/** Runs read from the same batch as the counts, so it shares their state —
 *  and its sublabel only claims "no runs" once that batch has actually
 *  answered, never while it is still in flight. */
function LastRunTile({ lastRun }: { lastRun: SystemOverview | null }) {
  if (!lastRun)
    return <StatTile icon={Activity} label="Last run" value={null} />;
  const run = lastRun.lastRun;
  return (
    <StatTile
      icon={Activity}
      label="Last run"
      value={run ? (run.error ? "Failed" : "Healthy") : "None yet"}
      numeric={false}
      sublabel={
        run
          ? `${run.items_fetched ?? 0} fetched · ${run.items_new ?? 0} new`
          : undefined
      }
    />
  );
}

function StatTiles() {
  const state = useSystemData<SystemOverview>(API.overview);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <CardData
        className="contents"
        state={state}
        skeleton={<StatRowSkeleton />}
      >
        {(o) => <StatRow overview={o} />}
      </CardData>
      <SignupsTile />
      <LastRunTile lastRun={state.data} />
    </div>
  );
}

function ItemsPerDayCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="Items per day" subtitle="Published, last 14 days">
      <CardData state={state} skeleton={<CardSkeleton />}>
        {(a) => (
          <ItemsAreaChart data={a.itemsPerDay} emptyLabel="No data yet." />
        )}
      </CardData>
    </ChartCard>
  );
}

export function OverviewTab() {
  return (
    <TabsContent value="overview" className={`${TAB_PANEL} space-y-4`}>
      <StatTiles />
      <div className="space-y-3">
        <ItemsPerDayCard />
        <TokenBurnCard />
      </div>
    </TabsContent>
  );
}
