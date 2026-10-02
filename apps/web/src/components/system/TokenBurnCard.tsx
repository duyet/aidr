import { useMemo, useState } from "react";
import { formatTokens } from "../../lib/format";
import type {
  LlmDayModelCount,
  LlmDayTaskCount,
  SystemLlm,
} from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData, CardSkeleton } from "./CardData";
import { ChartCard } from "./ChartCard";
import { TokenBurnSection } from "./DitherCharts";
import { API } from "./endpoints";
import { tokenBurnModelName } from "./run-format";

type BurnBy = "task" | "model";

function modelSeries(rows: LlmDayModelCount[]): LlmDayTaskCount[] {
  const merged = new Map<string, LlmDayTaskCount>();
  for (const row of rows) {
    const task = tokenBurnModelName(row.model);
    const key = `${row.date}\0${task}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        date: row.date,
        task,
        calls: row.calls,
        failures: row.failures,
        tokens: row.tokens,
      });
      continue;
    }
    current.calls += row.calls;
    current.failures += row.failures;
    current.tokens += row.tokens;
  }
  return [...merged.values()];
}

export function TokenBurnCard() {
  const state = useSystemData<SystemLlm>(API.llm);
  const [by, setBy] = useState<BurnBy>("task");
  const subtitle =
    by === "task"
      ? "Tokens per day by task, stacked (14 days)"
      : "Tokens per day by model, stacked (14 days)";
  return (
    <ChartCard
      title="Token burn"
      subtitle={subtitle}
      className="md:col-span-2"
      action={<BurnSwitch value={by} onChange={setBy} />}
    >
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(l) => <TokenBurnBody rows={l} by={by} />}
      </CardData>
    </ChartCard>
  );
}

function TokenBurnBody({ rows, by }: { rows: SystemLlm; by: BurnBy }) {
  const data = useMemo(
    () =>
      by === "model"
        ? modelSeries(rows.llmTokensByModel ?? [])
        : rows.llmCallsPerDay,
    [by, rows]
  );
  return (
    <TokenBurnSection
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
    <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            className={`rounded px-2 py-1 ${
              selected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
