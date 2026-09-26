import { Skeleton, TabsContent } from "@aidr/ui";
import type { SystemSources } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { SourcesIngestTable } from "./SourcesIngestTable";
import { TAB_PANEL } from "./tab-spacing";

function SourcesCard() {
  const state = useSystemData<SystemSources>(API.sources);
  return (
    <ChartCard
      title="Ingest sources"
      subtitle="Adapters the hourly pipeline fetches. Last run is items pulled in the latest workflow stats."
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(s) => (
          <SourcesIngestTable
            sources={s.ingestSources ?? []}
            lastRunBySource={s.lastRunBySource}
            volume={s.volume}
          />
        )}
      </CardData>
    </ChartCard>
  );
}

export function SourcesTab() {
  return (
    <TabsContent value="sources" className={`${TAB_PANEL} space-y-3`}>
      <SourcesCard />
    </TabsContent>
  );
}
