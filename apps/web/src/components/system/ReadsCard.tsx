import { Skeleton } from "@aidr/ui";
import type { SystemReads } from "../../lib/reads-query";
import { useSystemData } from "../../lib/use-system-stats";
import { BarList } from "./BarList";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";

const KIND_LABEL: Record<string, string> = {
  open: "Opens",
  outbound: "Outbound clicks",
};

export function ReadsCard() {
  const state = useSystemData<SystemReads>(API.reads);
  return (
    <ChartCard
      title="What readers read"
      subtitle="Opens and outbound clicks, last 28 days, first-party counts"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) =>
          d.total === 0 ? (
            <p className="text-xs text-muted-foreground">
              No reads recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              <BarList
                data={d.by_kind.map((k) => ({
                  name: KIND_LABEL[k.name] ?? k.name,
                  count: k.reads,
                }))}
                emptyLabel="No reads recorded yet."
              />
              <BarList
                data={d.by_category.map((c) => ({
                  name: c.name,
                  count: c.reads,
                }))}
                emptyLabel="No reads recorded yet."
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                By channel:{" "}
                {d.by_channel.map((c) => `${c.name} ${c.reads}`).join(", ")}
              </p>
            </div>
          )
        }
      </CardData>
    </ChartCard>
  );
}
