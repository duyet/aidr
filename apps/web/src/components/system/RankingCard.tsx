import { Skeleton } from "@aidr/ui";
import type { ModelChains } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { RankingExplainer } from "./RankingExplainer";

export function RankingCard() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <ChartCard
      title="Ranking"
      subtitle="How stories are scored"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RankingExplainer models={d.models} />}
      </CardData>
    </ChartCard>
  );
}
