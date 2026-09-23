import { formatTokens } from "../../lib/format";
import type { SystemLlm } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { TokenBurnSection } from "./DitherCharts";
import { API } from "./endpoints";

export function TokenBurnCard() {
  const state = useSystemData<SystemLlm>(API.llm);
  return (
    <ChartCard
      title="Token burn"
      subtitle="Tokens per day by task, stacked (14 days)"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(l) => (
          <TokenBurnSection
            data={l.llmCallsPerDay}
            emptyLabel="No token data yet."
            formatValue={formatTokens}
          />
        )}
      </CardData>
    </ChartCard>
  );
}
