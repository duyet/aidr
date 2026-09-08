import {
  Badge,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aidr/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Coins, Newspaper, Play, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminPanel } from "../components/system/AdminPanel";
import { BarList } from "../components/system/BarList";
import { ChartCard } from "../components/system/ChartCard";
import {
  CategoryDonut,
  ItemsAreaChart,
  TokensLineChart,
} from "../components/system/DitherCharts";
import { LlmSection } from "../components/system/LlmSection";
import { RankingExplainer } from "../components/system/RankingExplainer";
import { RunDurationBars } from "../components/system/RunDurationBars";
import { RunOutcomeBars } from "../components/system/RunOutcomeBars";
import { RunStatusStrip } from "../components/system/RunStatusStrip";
import { RunsList } from "../components/system/RunsList";
import { SourcesIngestTable } from "../components/system/SourcesIngestTable";
import { StatTile } from "../components/system/StatTile";
import { useAdmin } from "../lib/admin";
import { anyrouterModelUrl } from "../lib/anyrouter";
import { categoryLabel, statusLabel } from "../lib/lang";
import type { SystemStats } from "../lib/system-queries";
import type { Lang } from "../lib/types";

export const Route = createFileRoute("/data")({
  component: SystemPage,
});

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function DataSkeleton() {
  return (
    <div className="news-content news-data space-y-4 py-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-8 w-full max-w-lg" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
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
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState(false);
  const admin = useAdmin();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system")
      .then((res) => (res.ok ? (res.json() as Promise<SystemStats>) : null))
      .then((res) => {
        if (cancelled) return;
        if (res) setStats(res);
        else setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="news-content news-data mx-auto max-w-3xl py-16 text-center text-sm text-muted-foreground">
        Couldn't load system stats.
      </p>
    );
  }

  if (!stats) {
    return <DataSkeleton />;
  }

  const lastRunBySource = stats.lastRun?.stats?.bySource;

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
        </div>
      </header>

      <Tabs defaultValue="overview">
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard
              title="Last run"
              subtitle={
                stats.lastRun?.started_at
                  ? new Date(stats.lastRun.started_at * 1000).toLocaleString(
                      "en-US"
                    )
                  : "No runs recorded"
              }
              action={
                stats.lastRun ? (
                  <Badge
                    variant={stats.lastRun.error ? "destructive" : "secondary"}
                    className={
                      stats.lastRun.error
                        ? ""
                        : "border-transparent bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                    }
                  >
                    {stats.lastRun.error ? "Failed" : "Healthy"}
                  </Badge>
                ) : null
              }
            >
              {stats.lastRun ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    fetched{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {stats.lastRun.items_fetched ?? 0}
                    </span>
                  </span>
                  <Separator
                    orientation="vertical"
                    className="hidden h-4 sm:block"
                  />
                  <span className="text-muted-foreground">
                    new{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {stats.lastRun.items_new ?? 0}
                    </span>
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              )}
            </ChartCard>
            <ChartCard title="Items per day" subtitle="Published, last 14 days">
              <ItemsAreaChart
                data={stats.itemsPerDay}
                emptyLabel="No data yet."
              />
            </ChartCard>
            <ChartCard
              title="Tokens per day"
              subtitle="LLM spend, last 14 days"
              className="md:col-span-2"
            >
              <TokensLineChart
                data={stats.tokens.perDay}
                emptyLabel="No token data yet."
                formatValue={formatTokens}
              />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="content" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard title="Category share" subtitle="Top categories">
              <CategoryDonut
                data={stats.itemsByCategory}
                emptyLabel="No data yet."
              />
            </ChartCard>
            <ChartCard title="By status" subtitle="Pipeline outcome">
              <BarList
                data={stats.itemsByStatus.map((s) => ({
                  ...s,
                  name: statusLabel(s.name, lang),
                }))}
                emptyLabel="No data yet."
              />
            </ChartCard>
            <ChartCard title="By source" subtitle="Top 10 story counts">
              <BarList data={stats.itemsBySource} emptyLabel="No data yet." />
            </ChartCard>
            <ChartCard
              title="Catalog"
              subtitle="Translations, digests, sources"
            >
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
            </ChartCard>
            <ChartCard
              title="By category"
              subtitle="Top 10"
              className="md:col-span-2"
            >
              <BarList
                data={stats.itemsByCategory.map((c) => ({
                  ...c,
                  name: categoryLabel(c.name, lang),
                }))}
                emptyLabel="No data yet."
              />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard title="Run status" subtitle="Oldest to newest">
              <RunStatusStrip runs={stats.runs} emptyLabel="No runs yet." />
            </ChartCard>
            <ChartCard title="Duration" subtitle="Seconds per run">
              <RunDurationBars runs={stats.runs} emptyLabel="No data yet." />
            </ChartCard>
            <ChartCard
              title="Outcomes"
              subtitle="New / merged / rejected"
              className="md:col-span-2"
            >
              <RunOutcomeBars runs={stats.runs} emptyLabel="No data yet." />
            </ChartCard>
            <ChartCard
              title="Recent runs"
              subtitle="Last 30 workflow runs"
              className="md:col-span-2"
            >
              <RunsList runs={stats.runs} lang={lang} />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="sources" className="mt-0 space-y-3">
          <ChartCard
            title="Ingest sources"
            subtitle="Adapters the hourly pipeline fetches. Last run is items pulled in the latest workflow stats."
          >
            <SourcesIngestTable
              sources={stats.ingestSources ?? []}
              lastRunBySource={lastRunBySource}
            />
          </ChartCard>
          <ChartCard title="Volume" subtitle="Stored items by source_id">
            <BarList data={stats.itemsBySource} emptyLabel="No data yet." />
          </ChartCard>
        </TabsContent>

        <TabsContent value="llm" className="mt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ChartCard
              title="LLM calls"
              subtitle="Calls, failures, tokens (14 days)"
            >
              <LlmSection
                data={stats.llmCallsPerDay}
                formatTokens={formatTokens}
              />
            </ChartCard>
            <ChartCard
              title="Ranking"
              subtitle="How stories are scored"
              className="md:col-span-2"
            >
              <RankingExplainer models={stats.models} />
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
