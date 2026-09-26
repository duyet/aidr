import { Skeleton, TabsContent } from "@aidr/ui";
import type { WorkflowRunRow } from "../../lib/system-queries";
import type { Lang } from "../../lib/types";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { RunDurationChart } from "./RunDurationChart";
import { RunOutcomeChart } from "./RunOutcomeChart";
import { RunStatusStrip } from "./RunStatusStrip";
import { RunsList } from "./RunsList";
import { TAB_PANEL } from "./tab-spacing";

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

function RunDurationCard({ lang }: { lang: Lang }) {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard title="Duration" subtitle="Seconds per run, oldest to newest">
      <CardData state={state} skeleton={<Skeleton className="h-40 w-full" />}>
        {(d) => (
          <RunDurationChart
            runs={d.runs}
            emptyLabel="No data yet."
            lang={lang}
          />
        )}
      </CardData>
    </ChartCard>
  );
}

function RunOutcomeCard({ lang }: { lang: Lang }) {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard
      title="Outcomes"
      subtitle="New / merged / rejected items per run"
    >
      <CardData state={state} skeleton={<Skeleton className="h-40 w-full" />}>
        {(d) => (
          <RunOutcomeChart
            runs={d.runs}
            emptyLabel="No data yet."
            lang={lang}
          />
        )}
      </CardData>
    </ChartCard>
  );
}

function RecentRunsCard({ lang }: { lang: Lang }) {
  const state = useSystemData<{ runs: WorkflowRunRow[] }>(API.runs);
  return (
    <ChartCard title="Recent runs" subtitle="Last 30 workflow runs">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RunsList runs={d.runs} lang={lang} />}
      </CardData>
    </ChartCard>
  );
}

export function RunsTab({ lang }: { lang: Lang }) {
  return (
    <TabsContent value="runs" className={TAB_PANEL}>
      {/* One column, deliberately: every card here carries its own x-axis, so
          a 2-up grid squeezed 30 run labels into ~300px. */}
      <div className="grid grid-cols-1 gap-3">
        <RunStatusCard />
        <RunDurationCard lang={lang} />
        <RunOutcomeCard lang={lang} />
        <RecentRunsCard lang={lang} />
      </div>
    </TabsContent>
  );
}
