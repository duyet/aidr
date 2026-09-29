import { Skeleton, TabsContent } from "@aidr/ui";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { ModelChains } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { RankingCard } from "./RankingCard";
import { TokenBurnCard } from "./TokenBurnCard";
import { TAB_PANEL } from "./tab-spacing";

function JevDecisionsCard() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <ChartCard
      title="Jev decisions"
      subtitle="TypeSafe intent & quality gates, via AnyRouter"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => (
          <div className="space-y-2.5 text-xs leading-relaxed">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">model</span>
              {d.models.decisions.length === 0 ? (
                <span className="font-mono">—</span>
              ) : (
                d.models.decisions.map((model) => (
                  <a
                    key={model}
                    href={anyrouterModelUrl(model)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full font-mono text-[11px] text-accent underline underline-offset-2 hover:no-underline"
                    title={`Open ${model} on AnyRouter`}
                  >
                    {model}
                  </a>
                ))
              )}
              <span className="text-muted-foreground">
                Jev is BYOK-only · chat models back it up
              </span>
            </div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  Story submissions
                </span>{" "}
                — ai_tech × (1 − spam) relevance gate
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Translation suggestions
                </span>{" "}
                — improvement + quality gate (≥ 0.6)
              </li>
              <li>
                Chat-completions judges stay as automatic fallback, so a Jev
                outage never blocks ingest.
              </li>
            </ul>
          </div>
        )}
      </CardData>
    </ChartCard>
  );
}

export function LlmTab() {
  return (
    <TabsContent value="llm" className={TAB_PANEL}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TokenBurnCard />
        <RankingCard />
        <JevDecisionsCard />
      </div>
    </TabsContent>
  );
}
