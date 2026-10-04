import { useMemo, useState } from "react";
import { formatTokens } from "../../lib/format";
import type { SystemLlm } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { TokenBurnSection } from "./DitherCharts";
import { API } from "./endpoints";
import { type BurnBy, rowsForBurn } from "./token-burn";

export function TokenBurnCard() {
  const state = useSystemData<SystemLlm>(API.llm);
  const [by, setBy] = useState<BurnBy>("task");
  const subtitle =
    by === "task"
      ? "Tokens per day by task, stacked (14 days)"
      : "Tokens per day by model, stacked (14 days)";
  return (
    <ChartCard title="Token burn" subtitle={subtitle} className="md:col-span-2">
      <div className="space-y-3">
        <BurnSwitch value={by} onChange={setBy} />
        <CardData state={state} skeleton={<CardSkeleton tall />}>
          {(l) => <TokenBurnBody rows={l} by={by} />}
        </CardData>
      </div>
    </ChartCard>
  );
}

function TokenBurnBody({ rows, by }: { rows: SystemLlm; by: BurnBy }) {
  const data = useMemo(
    () => rowsForBurn(by, rows.llmCallsPerDay, rows.llmTokensByModel),
    [by, rows]
  );
  return (
    <TokenBurnSection
      key={by}
      data={data}
      emptyLabel="No token data yet."
      formatValue={formatTokens}
      seriesNoun={by === "model" ? "model" : "task"}
    />
  );
}

function BurnSwitch({
  value,
  onChange,
}: {
  value: BurnBy;
  onChange: (next: BurnBy) => void;
}) {
  const options: { id: BurnBy; label: string }[] = [
    { id: "task", label: "By Task" },
    { id: "model", label: "By Model" },
  ];
  return (
    <fieldset className="m-0 grid w-full min-w-0 grid-cols-2 gap-1.5 rounded-xl border-0 bg-muted/40 p-1.5 text-muted-foreground">
      <legend className="sr-only">Token burn grouping</legend>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              selected
                ? "bg-background text-foreground shadow-2xs"
                : "hover:text-foreground"
            }`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
