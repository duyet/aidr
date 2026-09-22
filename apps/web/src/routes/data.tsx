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
import { AdminPanel } from "../components/system/AdminPanel";
import { BarList } from "../components/system/BarList";
import { ChartCard } from "../components/system/ChartCard";
import {
  CategoryDonut,
  ItemsAreaChart,
  TokenBurnSection,
  TokensLineChart,
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
import type { Lang } from "../lib/types";
import { useSystemStats } from "../lib/use-system-stats";

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

function SystemPage() {
  const lang: Lang = "en";
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { stats, error } = useSystemStats();
  const admin = useAdmin();
  const tab: DataTab =
    search.tab === "admin" && !admin.isAdmin && !admin.loading
      ? "overview"
      : (search.tab ?? "overview");

  const lastRunBySource = stats?.lastRun?.stats?.bySource;

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
        <div className="flex flex-wrap items-center gap-1.5">
          {stats ? (
            <>
              <ModelChip label="score" models={stats.models.scoring} />
              <ModelChip label="translate" models={stats.models.translation} />
              <a
                href="https://anyrouter.dev/?ref=aidr.today"
                target="_blank"
                rel="noopener"
                className="text-[11px] font-medium text-accent underline underline-offset-2 hover:no-underline"
              >
                AnyRouter
              </a>
            </>
          ) : (
            <Skeleton className="h-6 w-48" />
          )}
        </div>
      </header>

      {error && !stats ? (
        <p className="mb-4 rounded-lg border border-border px-4 py-3 text-center text-sm text-muted-foreground">
          Couldn't load system stats.
        </p>
      ) : null}

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
          {admin.isAdmin ? (
            <TabsTrigger value="admin" className="px-2.5 text-xs">
              Admin
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          {stats ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <StatTile
                icon={Newspaper}
                label="Stories"
                value={String(stats.totals.items)}
              />
              <StatTile
                icon={Coins}
                label="Tokens"
                value={formatTokens(stats.tokens.total)}
                sublabel={`${stats.tokens.avgPerItem} avg/item`}
              />
              <StatTile
                icon={Play}
                label="Runs today"
                value={String(stats.runsToday)}
              />
              <StatTile
                icon={Users}
                label="Subscribers"
                value={String(stats.totals.subscribers)}
              />
              <StatTile
                icon={Activity}
                label="Last run"
                value={
                  stats.lastRun
                    ? stats.lastRun.error
                      ? "Failed"
                      : "Healthy"
                    : "—"
                }
                sublabel={
                  stats.lastRun
                    ? `${stats.lastRun.items_fetched ?? 0} fetched · ${stats.lastRun.items_new ?? 0} new`
                    : "No runs recorded"
                }
              />
            </div>
          ) : (
            <DataSkeleton />
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard
              title="Items per day"
              subtitle="Published, last 14 days"
              className="md:col-span-2"
            >
              {stats ? (
                <ItemsAreaChart
                  data={stats.itemsPerDay}
                  emptyLabel="No data yet."
                />
              ) : (
                <CardSkeleton />
              )}
            </ChartCard>
            <ChartCard
              title="Tokens per day"
              subtitle="LLM spend, last 14 days"
              className="md:col-span-2"
            >
              {stats ? (
                <TokensLineChart
                  data={stats.tokens.perDay}
                  emptyLabel="No token data yet."
                  formatValue={formatTokens}
                />
              ) : (
                <CardSkeleton />
              )}
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard title="Category share" subtitle="Top categories">
              {stats ? (
                <CategoryDonut
                  data={stats.itemsByCategory}
                  emptyLabel="No data yet."
                />
              ) : (
                <CardSkeleton tall />
              )}
            </ChartCard>
            <ChartCard title="By status" subtitle="Pipeline outcome">
              {stats ? (
                <BarList
                  data={stats.itemsByStatus.map((s) => ({
                    ...s,
                    name: statusLabel(s.name, lang),
                  }))}
                  emptyLabel="No data yet."
                />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
            <ChartCard title="By source" subtitle="Top 10 story counts">
              {stats ? (
                <BarList data={stats.itemsBySource} emptyLabel="No data yet." />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
            <ChartCard
              title="Catalog"
              subtitle="Translations, digests, sources"
            >
              {stats ? (
                <dl className="divide-y divide-border text-sm">
                  {(
                    [
                      ["Translations", stats.totals.translations],
                      ["AI;DR digests", stats.totals.tldrSnapshots],
                      ["Latest digest", stats.latestTldrDate ?? "—"],
                      ["Configured sources", stats.totals.sources],
                      ["Key-source citations", stats.totals.itemSourcesRows],
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
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
            <ChartCard
              title="By category"
              subtitle="Top 10"
              className="md:col-span-2"
            >
              {stats ? (
                <BarList
                  data={stats.itemsByCategory.map((c) => ({
                    ...c,
                    name: categoryLabel(c.name, lang),
                  }))}
                  emptyLabel="No data yet."
                />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard title="Run status" subtitle="Oldest to newest">
              {stats ? (
                <RunStatusStrip runs={stats.runs} emptyLabel="No runs yet." />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
            <ChartCard title="Duration" subtitle="Seconds per run">
              {stats ? (
                <RunDurationBars runs={stats.runs} emptyLabel="No data yet." />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
            <ChartCard
              title="Outcomes"
              subtitle="New / merged / rejected"
              className="md:col-span-2"
            >
              {stats ? (
                <RunOutcomeBars runs={stats.runs} emptyLabel="No data yet." />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
            <ChartCard
              title="Recent runs"
              subtitle="Last 30 workflow runs"
              className="md:col-span-2"
            >
              {stats ? (
                <RunsList runs={stats.runs} lang={lang} />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="sources" className="mt-0 space-y-3">
          <ChartCard
            title="Ingest sources"
            subtitle="Adapters the hourly pipeline fetches. Last run is items pulled in the latest workflow stats."
          >
            {stats ? (
              <SourcesIngestTable
                sources={stats.ingestSources ?? []}
                lastRunBySource={lastRunBySource}
              />
            ) : (
              <Skeleton className="h-28 w-full" />
            )}
          </ChartCard>
          <ChartCard title="Volume" subtitle="Stored items by source_id">
            {stats ? (
              <BarList data={stats.itemsBySource} emptyLabel="No data yet." />
            ) : (
              <Skeleton className="h-28 w-full" />
            )}
          </ChartCard>
        </TabsContent>

        <TabsContent value="llm" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard
              title="Token burn"
              subtitle="Tokens per day by task, stacked (14 days)"
              className="md:col-span-2"
            >
              {stats ? (
                <TokenBurnSection
                  data={stats.llmCallsPerDay}
                  emptyLabel="No token data yet."
                  formatValue={formatTokens}
                />
              ) : (
                <CardSkeleton tall />
              )}
            </ChartCard>
            <ChartCard
              title="Ranking"
              subtitle="How stories are scored"
              className="md:col-span-2"
            >
              {stats ? (
                <RankingExplainer models={stats.models} />
              ) : (
                <Skeleton className="h-28 w-full" />
              )}
            </ChartCard>
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
