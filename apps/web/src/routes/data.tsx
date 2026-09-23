import {
  Badge,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aidr/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Coins, Newspaper, Play, Users } from "lucide-react";
import type { ReactNode } from "react";
import { AdminPanel } from "../components/system/AdminPanel";
import { BarList } from "../components/system/BarList";
import { ChartCard } from "../components/system/ChartCard";
import {
  CategoryDonut,
  ItemsAreaChart,
  TokenBurnSection,
} from "../components/system/DitherCharts";
import { RankingExplainer } from "../components/system/RankingExplainer";
import { RunDurationBars } from "../components/system/RunDurationBars";
import { RunOutcomeBars } from "../components/system/RunOutcomeBars";
import { RunStatusStrip } from "../components/system/RunStatusStrip";
import { RunsList } from "../components/system/RunsList";
import { SourcesIngestTable } from "../components/system/SourcesIngestTable";
import { StatTile } from "../components/system/StatTile";
import { useAdmin } from "../lib/admin";
import { anyrouterModelUrl } from "../lib/anyrouter";
import { type DataTab, parseDataTab } from "../lib/data-tab";
import { categoryLabel, statusLabel } from "../lib/lang";
import { pageHead } from "../lib/seo";
import type {
  ModelChains,
  SystemActivity,
  SystemLlm,
  SystemOverview,
  SystemSources,
  WorkflowRunRow,
} from "../lib/system-queries";
import type { Lang } from "../lib/types";
import { type SystemDataState, useSystemData } from "../lib/use-system-stats";

export interface DataSearch {
  tab?: DataTab;
}

export const Route = createFileRoute("/data")({
  validateSearch: (search: Record<string, unknown>): DataSearch => {
    const tab = parseDataTab(search.tab);
    return tab ? { tab } : {};
  },
  head: () =>
    pageHead({
      path: "/data",
      title: "Pipeline | AI News",
    }),
  component: SystemPage,
});

/** One small endpoint per section; each is a single batched D1 round-trip.
 * Cards call them directly — concurrent calls share one request via
 * useSystemData's inflight cache. */
const API = {
  models: "/api/system/models",
  overview: "/api/system/overview",
  activity: "/api/system/activity",
  runs: "/api/system/runs",
  llm: "/api/system/llm",
  sources: "/api/system/sources",
} as const;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function DataSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-lg" />
      ))}
    </div>
  );
}

/** Local loading placeholder sized like the card body it replaces, so
 *  content popping in never shifts layout. */
function CardSkeleton({ tall }: { tall?: boolean }) {
  return <Skeleton className={`w-full ${tall ? "h-52" : "h-44"}`} />;
}

/** Per-card data state: the card's own skeleton while its endpoint is in
 * flight, a quiet inline note on failure — one slow query never blanks
 * the whole page anymore. */
function CardData<T>({
  state,
  skeleton,
  children,
}: {
  state: SystemDataState<T>;
  skeleton: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) {
    return <p className="text-sm text-muted-foreground">Couldn't load.</p>;
  }
  return <>{skeleton}</>;
}

function ModelChip({ label, models }: { label: string; models: string[] }) {
  const lead = models[0];
  return (
    <Badge variant="secondary" className="h-6 gap-1 px-2 font-normal">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {lead ? (
        <a
          href={anyrouterModelUrl(lead)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] text-foreground underline-offset-2 hover:text-accent hover:underline"
          title={`Open ${lead} on AnyRouter`}
        >
          {lead}
        </a>
      ) : (
        <span className="font-mono text-[11px]">—</span>
      )}
      {models.length > 1 ? (
        <span className="text-[10px] text-muted-foreground">
          +{models.length - 1}
        </span>
      ) : null}
    </Badge>
  );
}

function ModelChips() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CardData state={state} skeleton={<Skeleton className="h-6 w-48" />}>
        {(d) => (
          <>
            <ModelChip label="score" models={d.models.scoring} />
            <ModelChip label="translate" models={d.models.translation} />
          </>
        )}
      </CardData>
      <a
        href="https://anyrouter.dev/?ref=aidr.today"
        target="_blank"
        rel="noopener"
        className="text-[11px] font-medium text-accent underline underline-offset-2 hover:no-underline"
      >
        AnyRouter
      </a>
    </div>
  );
}

function StatTiles() {
  const state = useSystemData<SystemOverview>(API.overview);
  return (
    <CardData state={state} skeleton={<DataSkeleton />}>
      {(o) => (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile
            icon={Newspaper}
            label="Stories"
            value={String(o.totals.items)}
          />
          <StatTile
            icon={Coins}
            label="Tokens"
            value={formatTokens(o.tokens.total)}
            sublabel={`${o.tokens.avgPerItem} avg/item`}
          />
          <StatTile
            icon={Play}
            label="Runs today"
            value={String(o.runsToday)}
          />
          <StatTile
            icon={Users}
            label="Subscribers"
            value={String(o.totals.subscribers)}
          />
          <StatTile
            icon={Activity}
            label="Last run"
            value={o.lastRun ? (o.lastRun.error ? "Failed" : "Healthy") : "—"}
            sublabel={
              o.lastRun
                ? `${o.lastRun.items_fetched ?? 0} fetched · ${o.lastRun.items_new ?? 0} new`
                : "No runs recorded"
            }
          />
        </div>
      )}
    </CardData>
  );
}

function ItemsPerDayCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard
      title="Items per day"
      subtitle="Published, last 14 days"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<CardSkeleton />}>
        {(a) => (
          <ItemsAreaChart data={a.itemsPerDay} emptyLabel="No data yet." />
        )}
      </CardData>
    </ChartCard>
  );
}

function TokenBurnCard() {
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

function RankingCard() {
  const state = useSystemData<{ models: ModelChains }>(API.models);
  return (
    <ChartCard
      title="Ranking"
      subtitle="How stories are scored"
      className="md:col-span-2"
    >
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(d) => <RankingExplainer models={d.models} />}
      </CardData>
    </ChartCard>
  );
}

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

function CategoryShareCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="Category share" subtitle="Top categories">
      <CardData state={state} skeleton={<CardSkeleton tall />}>
        {(a) => (
          <CategoryDonut data={a.itemsByCategory} emptyLabel="No data yet." />
        )}
      </CardData>
    </ChartCard>
  );
}

function StatusCard({ lang }: { lang: Lang }) {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="By status" subtitle="Pipeline outcome">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(a) => (
          <BarList
            data={a.itemsByStatus.map((s) => ({
              ...s,
              name: statusLabel(s.name, lang),
            }))}
            emptyLabel="No data yet."
          />
        )}
      </CardData>
    </ChartCard>
  );
}

function SourceVolumeCard() {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="By source" subtitle="Top 10 story counts">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(a) => <BarList data={a.itemsBySource} emptyLabel="No data yet." />}
      </CardData>
    </ChartCard>
  );
}

function CatalogCard() {
  const state = useSystemData<SystemOverview>(API.overview);
  return (
    <ChartCard title="Catalog" subtitle="Translations, digests, sources">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(o) => (
          <dl className="divide-y divide-border text-sm">
            {(
              [
                ["Translations", o.totals.translations],
                ["AI;DR digests", o.totals.tldrSnapshots],
                ["Latest digest", o.latestTldrDate ?? "—"],
                ["Configured sources", o.totals.sources],
                ["Key-source citations", o.totals.itemSourcesRows],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </CardData>
    </ChartCard>
  );
}

function ByCategoryCard({ lang }: { lang: Lang }) {
  const state = useSystemData<SystemActivity>(API.activity);
  return (
    <ChartCard title="By category" subtitle="Top 10" className="md:col-span-2">
      <CardData state={state} skeleton={<Skeleton className="h-28 w-full" />}>
        {(a) => (
          <BarList
            data={a.itemsByCategory.map((c) => ({
              ...c,
              name: categoryLabel(c.name, lang),
            }))}
            emptyLabel="No data yet."
          />
        )}
      </CardData>
    </ChartCard>
  );
}

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

function SystemPage() {
  const lang: Lang = "en";
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const admin = useAdmin();
  const tab: DataTab =
    search.tab === "admin" && !admin.isAdmin && !admin.loading
      ? "overview"
      : (search.tab ?? "overview");

  return (
    <div className="news-content news-data py-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-xl font-semibold tracking-tight text-foreground">
            Pipeline
          </h1>
          <p className="text-xs text-muted-foreground">
            Live ingest, content, and token use.
          </p>
        </div>
        <ModelChips />
      </header>

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const parsed = parseDataTab(next);
          if (!parsed) return;
          if (parsed === "admin" && !admin.isAdmin) return;
          void navigate({
            search: parsed === "overview" ? {} : { tab: parsed },
            replace: true,
          });
        }}
      >
        <TabsList className="mb-4 h-auto min-h-9 w-full flex-wrap justify-start gap-0.5">
          <TabsTrigger value="overview" className="px-2.5 text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="content" className="px-2.5 text-xs">
            Content
          </TabsTrigger>
          <TabsTrigger value="runs" className="px-2.5 text-xs">
            Runs
          </TabsTrigger>
          <TabsTrigger value="sources" className="px-2.5 text-xs">
            Sources
          </TabsTrigger>
          <TabsTrigger value="llm" className="px-2.5 text-xs">
            LLM
          </TabsTrigger>
          <TabsTrigger value="algo" className="px-2.5 text-xs">
            Algo
          </TabsTrigger>
          {admin.isAdmin ? (
            <TabsTrigger value="admin" className="px-2.5 text-xs">
              Admin
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <StatTiles />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ItemsPerDayCard />
            <TokenBurnCard />
          </div>
        </TabsContent>

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
                  <span className="font-medium text-foreground">Watchdog</span>{" "}
                  — GitHub Actions at :05 / :20 / :35 / :50, 45-min coalesce
                </li>
                <li>
                  <span className="font-medium text-foreground">Hide</span> —
                  relevance &lt; 0.4 never reaches the feed
                </li>
                <li>
                  <span className="font-medium text-foreground">Trending</span>{" "}
                  — rank ≥ 20 and importance ≥ 7, max 6/day
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

        <TabsContent value="content" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CategoryShareCard />
            <StatusCard lang={lang} />
            <SourceVolumeCard />
            <CatalogCard />
            <ByCategoryCard lang={lang} />
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <RunStatusCard />
            <RunDurationCard />
            <RunOutcomeCard />
            <RecentRunsCard lang={lang} />
          </div>
        </TabsContent>

        <TabsContent value="sources" className="mt-0 space-y-3">
          <SourcesCard />
        </TabsContent>

        <TabsContent value="llm" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TokenBurnCard />
            <RankingCard />
            <JevDecisionsCard />
          </div>
        </TabsContent>

        {admin.isAdmin ? (
          <TabsContent value="admin" className="mt-0">
            <AdminPanel admin={admin} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
