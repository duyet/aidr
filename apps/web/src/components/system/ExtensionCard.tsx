import { Skeleton } from "@aidr/ui";
import type { SystemExtEvents } from "../../lib/ext-events-query";
import { useSystemData } from "../../lib/use-system-stats";
import { BarList } from "./BarList";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";

export function ExtensionCard() {
  const state = useSystemData<SystemExtEvents>(API.extension);
  return (
    <ChartCard
      title="Chrome extension"
      subtitle="New-tab opens a day and link clicks, last 28 days, first-party counts"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) =>
          d.total_opens === 0 ? (
            <p className="text-xs text-muted-foreground">
              No extension events recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {d.total_opens} new-tab opens. One per minute per network
                address at most, so this undercounts heavy use.
              </p>
              <BarList
                data={d.by_day.map((r) => ({ name: r.day, count: r.opens }))}
                emptyLabel="No opens recorded yet."
              />
              <BarList
                data={d.by_channel.map((c) => ({
                  name: `Click: ${c.name}`,
                  count: c.clicks,
                }))}
                emptyLabel="No link clicks recorded yet."
              />
            </div>
          )
        }
      </CardData>
    </ChartCard>
  );
}
