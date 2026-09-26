import { TabsContent } from "@aidr/ui";
import { ExternalLink } from "lucide-react";
import { ChartCard } from "./ChartCard";
import { RankingCard } from "./RankingCard";
import { TAB_PANEL } from "./tab-spacing";

const ANYROUTER_URL = "https://anyrouter.dev/?ref=aidr.today";

function AnyRouterCard() {
  return (
    <ChartCard
      title="AnyRouter"
      subtitle="One gateway behind every model in this pipeline"
      className="md:col-span-2"
    >
      {/* Deliberately no model list here: the same four chains already render
          in the Ranking card on this tab, and the attribution strip above the
          tabs names each task's lead model. This card is the gateway pitch,
          not another copy of the chains. */}
      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          Every LLM call in the pipeline — scoring, translation, TL;DR, and the
          decision judges — goes through one AnyRouter key. Per-task model
          overrides, automatic fallback chains, and JSON mode are configured in
          one place instead of four.
        </p>
        <a
          href={ANYROUTER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore AnyRouter
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </ChartCard>
  );
}

export function AlgoTab() {
  return (
    <TabsContent value="algo" className={TAB_PANEL}>
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
