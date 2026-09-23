import { Skeleton, TabsContent } from "@aidr/ui";
import type { WorkflowRunRow } from "../../lib/system-queries";
import type { Lang } from "../../lib/types";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { RunDurationBars } from "./RunDurationBars";
import { RunOutcomeBars } from "./RunOutcomeBars";
import { RunStatusStrip } from "./RunStatusStrip";
import { RunsList } from "./RunsList";

function RunStatusCard() {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard title="Run status" subtitle="Oldest to newest">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RunStatusStrip runs={d.runs} emptyLabel="No runs yet." />}
      </CardData>
    </ChartCard>
  );
}

function RunDurationCard() {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard title="Duration" subtitle="Seconds per run">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RunDurationBars runs={d.runs} emptyLabel="No data yet." />}
      </CardData>
    </ChartCard>
  );
}

function RunOutcomeCard() {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard
      title="Outcomes"
      subtitle="New / merged / rejected"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RunOutcomeBars runs={d.runs} emptyLabel="No data yet." />}
      </CardData>
    </ChartCard>
  );
}

function RecentRunsCard({ lang }: { lang: Lang }) {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard
      title="Recent runs"
      subtitle="Last 30 workflow runs"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RunsList runs={d.runs} lang={lang} />}
      </CardData>
    </ChartCard>
  );
}

export function RunsTab({ lang }: { lang: Lang }) {
  return (
    <TabsContent value="runs" className="mt-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <RunStatusCard />
        <RunDurationCard />
        <RunOutcomeCard />
        <RecentRunsCard lang={lang} />
      </div>
    </TabsContent>
  );
}
