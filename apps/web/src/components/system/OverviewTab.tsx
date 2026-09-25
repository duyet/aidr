import { TabsContent } from "@aidr/ui";
import { Activity, Coins, Newspaper, Play, Users } from "lucide-react";
import { formatTokens } from "../../lib/format";
import type { SystemActivity, SystemOverview } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData, CardSkeleton, DataSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { ItemsAreaChart } from "./DitherCharts";
import { API } from "./endpoints";
import { StatTile } from "./StatTile";
import { TokenBurnCard } from "./TokenBurnCard";

function StatTiles() {
  const state = useSystemData<SystemOverview>(API.overview);
  return (
    <CardData state={state} skeleton={<DataSkeleton />}>
      {(o) => (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile
            icon={Newspaper}
            label="Stories"
            value={String(o.totals.items)}
          />
          <StatTile
            icon={Coins}
            label="Tokens"
            value={formatTokens(o.tokens.total)}
            sublabel={`${o.tokens.avgPerItem} avg/item`}
          />
          <StatTile
            icon={Play}
            label="Runs today"
            value={String(o.runsToday)}
          />
          {/* D1 subscribers are email subscriptions, not Clerk accounts. */}
          <StatTile
            icon={Users}
            label="Subscribers"
            value={String(o.totals.subscribers)}
            sublabel="Email subscriptions"
          />
          <StatTile
            icon={Activity}
            label="Last run"
            value={o.lastRun ? (o.lastRun.error ? "Failed" : "Healthy") : "—"}
            sublabel={
              o.lastRun
                ? `${o.lastRun.items_fetched ?? 0} fetched · ${o.lastRun.items_new ?? 0} new`
                : "No runs recorded"
            }
          />
        </div>
      )}
    </CardData>
  );
}

function ItemsPerDayCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard
      title="Items per day"
      subtitle="Published, last 14 days"
      className="md:col-span-2"
    >
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
    <TabsContent value="overview" className="mt-0 space-y-4">
      <StatTiles />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ItemsPerDayCard />
        <TokenBurnCard />
      </div>
    </TabsContent>
  );
}
