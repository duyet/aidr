import { Skeleton, TabsContent } from "@aidr/ui";
import { anyrouterModelUrl } from "../../lib/anyrouter";
import type { ModelChains } from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { RankingCard } from "./RankingCard";

function AnyRouterCard() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <ChartCard
      title="Powered by AnyRouter"
      subtitle="Every LLM call in the pipeline above"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => (
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["score", d.models.scoring],
                  ["translate", d.models.translation],
                  ["tldr", d.models.tldr],
                  ["decisions", d.models.decisions],
                ] as const
              ).map(([label, chain]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  {chain.length === 0 ? (
                    <span className="font-mono">—</span>
                  ) : (
                    chain.map((model) => (
                      <a
                        key={`${label}-${model}`}
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
                </span>
              ))}
            </div>
            <p className="text-muted-foreground">
              Model fallback chains with per-task overrides, JSON mode, and
              BYOK-only judges — explore them on{" "}
              <a
                href="https://anyrouter.dev/?ref=aidr.today"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent underline underline-offset-2 hover:no-underline"
              >
                AnyRouter
              </a>
              .
            </p>
          </div>
        )}
      </CardData>
    </ChartCard>
  );
}

export function AlgoTab() {
  return (
    <TabsContent value="algo" className="mt-0">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <RankingCard />
        <ChartCard title="Pipeline" subtitle="Hourly ingest, end to end">
          <ol className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            {[
              ["Fetch", "HN, HuggingNews, Lobsters, RSS, newsrooms"],
              ["Score", "Jev judgments, then the LLM rubric"],
              ["Merge", "same story collapses to one canonical item"],
              ["Translate", "EN → VI, journalist style"],
              ["Rank", "importance × quality × freshness × engagement"],
              ["Digest", "TL;DR snapshot + per-subscriber email"],
              ["Notify", "Telegram digest + exceptional trending posts"],
            ].map(([step, detail]) => (
              <li key={step} className="flex gap-2">
                <span className="font-medium text-foreground">{step}</span>
                <span>{detail}</span>
              </li>
            ))}
          </ol>
        </ChartCard>
        <ChartCard title="Schedule & ratings" subtitle="Cron, gates, bars">
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Hourly</span> —
              Durable Object alarm drives each run (no Worker cron)
            </li>
            <li>
              <span className="font-medium text-foreground">Watchdog</span> —
              GitHub Actions at :05 / :20 / :35 / :50, 45-min coalesce
            </li>
            <li>
              <span className="font-medium text-foreground">Hide</span> —
              relevance &lt; 0.4 never reaches the feed
            </li>
            <li>
              <span className="font-medium text-foreground">Trending</span> —
              rank ≥ 20 and importance ≥ 7, max 6/day
            </li>
            <li>
              <span className="font-medium text-foreground">Review</span> —
              suggestions & submissions judged at rating ≥ 0.6
            </li>
          </ul>
        </ChartCard>
        <AnyRouterCard />
      </div>
    </TabsContent>
  );
}
