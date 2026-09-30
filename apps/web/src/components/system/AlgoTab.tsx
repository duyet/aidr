import { Skeleton, TabsContent } from "@aidr/ui";
import { ExternalLink } from "lucide-react";
import { ANYROUTER_URL } from "../../lib/site";
import type {
  ObservedSourceHealth,
  SystemSources,
} from "../../lib/system-queries";
import { useSystemData } from "../../lib/use-system-stats";
import { AnyRouterMark } from "./AnyRouterMark";
import { CardData } from "./CardData";
import { ChartCard } from "./ChartCard";
import { API } from "./endpoints";
import { RankingCard } from "./RankingCard";
import { TAB_PANEL } from "./tab-spacing";

const SKIP_REASON_TEXT: Record<string, string> = {
  fetch_failed: "fetch failed",
  parse_failed: "feed unparseable",
  empty: "no items in window",
  all_rejected_below_relevance: "all rejected below relevance",
  disabled: "disabled",
};

/**
 * The worst outcomes across every configured source, so the Algo tab answers
 * "is anything broken right now" without a second click. Ordering is by
 * severity, not by count: a source that is *stale* matters more than one that
 * merely returned nothing this hour, because a source can legitimately be
 * quiet for a run and can never legitimately be silent for a week.
 */
function sourceAlerts(s: SystemSources) {
  // Narrow to *observed* rows: an unobserved source has no health verdict at
  // all, so it must not be counted as "healthy" or as a problem.
  const rows = (s.ingestSources ?? [])
    .map((source) => ({ source, health: s.health?.[source.id] }))
    .filter(
      (
        row
      ): row is {
        source: (typeof s.ingestSources)[number];
        health: ObservedSourceHealth;
      } => row.health?.observed === true
    );
  const stale = rows.filter((row) => row.health.stale);
  const problems = rows
    .filter((row) => !row.health.stale && row.health.skipReason)
    .sort((a, b) => b.health.emptyRuns - a.health.emptyRuns);
  return { stale, problems: problems.slice(0, 6) };
}

function SourceHealthCard() {
  const state = useSystemData<SystemSources>(API.sources);
  return (
    <ChartCard
      title="Source health"
      subtitle="Per-source outcome of the last ingest run, and anything that has gone quiet. Adding a source is a data change — see the /data Sources tab and the worker README."
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-20 w-full" />}>
        {(s) => {
          const { stale, problems } = sourceAlerts(s);
          const totals = (s.ingestSources ?? []).reduce(
            (acc, source) => {
              const h = s.health?.[source.id];
              if (!h?.observed) return acc;
              acc.fetched += h.fetched;
              acc.accepted += h.accepted;
              acc.rejected += h.rejected;
              return acc;
            },
            { fetched: 0, accepted: 0, rejected: 0 }
          );
          return (
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                Last run: <span className="font-mono">{totals.fetched}</span>{" "}
                fetched across every source,{" "}
                <span className="font-mono">{totals.accepted}</span> accepted,
                <span className="font-mono"> {totals.rejected}</span> rejected
                below the relevance floor.
              </p>
              {stale.length > 0 ? (
                <p className="text-destructive">
                  <span className="font-medium">Stale</span> — silent for more
                  runs than their threshold:{" "}
                  {stale.map((row) => row.source.name).join(", ")}
                </p>
              ) : null}
              {problems.length > 0 ? (
                <ul className="space-y-0.5">
                  {problems.map((row) => (
                    <li key={row.source.id}>
                      <span className="font-medium text-foreground">
                        {row.source.name}
                      </span>{" "}
                      —{" "}
                      {SKIP_REASON_TEXT[row.health.skipReason] ??
                        row.health.skipReason}
                      {row.health.emptyRuns > 1
                        ? ` (${row.health.emptyRuns} runs)`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {stale.length === 0 && problems.length === 0 ? (
                <p>Every configured source delivered or explained itself.</p>
              ) : null}
            </div>
          );
        }}
      </CardData>
    </ChartCard>
  );
}

function AnyRouterCard() {
  return (
    <ChartCard
      title={
        <span className="flex items-center gap-1.5">
          <AnyRouterMark className="h-3.5 w-auto" />
          AnyRouter
        </span>
      }
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
              [
                "Fetch",
                "HN, HuggingNews, Lobsters, RSS, newsrooms, arXiv, Vietnamese",
              ],
              ["Score", "Jev judgments, then the LLM rubric"],
              ["Merge", "same story collapses to one canonical item"],
              ["Translate", "EN → VI, journalist style; VI → EN for native VI"],
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
              rank ≥ 30 and importance ≥ 8, max 3/day (6 when importance ≥ 9),
              09–23h
            </li>
            <li>
              <span className="font-medium text-foreground">Review</span> —
              suggestions & submissions judged at rating ≥ 0.6
            </li>
            <li>
              <span className="font-medium text-foreground">Flood gate</span> —
              firehose feeds (arXiv, 24h newsrooms) are keyword-filtered and
              newest-capped per run before the scorer sees them
            </li>
          </ul>
        </ChartCard>
        <SourceHealthCard />
        <AnyRouterCard />
      </div>
    </TabsContent>
  );
}
