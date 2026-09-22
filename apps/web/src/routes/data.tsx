import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aidr/ui";
import { createFileRoute } from "@tanstack/react-router";
import { AdminPanel } from "../components/system/AdminPanel";
import { AlgoTab } from "../components/system/AlgoTab";
import { ContentTab } from "../components/system/ContentTab";
import { LlmTab } from "../components/system/LlmTab";
import { ModelAttribution } from "../components/system/ModelAttribution";
import { OverviewTab } from "../components/system/OverviewTab";
import { RunsTab } from "../components/system/RunsTab";
import { SourcesTab } from "../components/system/SourcesTab";
import { useAdmin } from "../lib/admin";
import { type DataTab, parseDataTab } from "../lib/data-tab";
import { pageHead } from "../lib/seo";
import type { Lang } from "../lib/types";

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
        <ModelAttribution />
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

        <OverviewTab />
        <AlgoTab />
        <ContentTab lang={lang} />
        <RunsTab lang={lang} />
        <SourcesTab />
        <LlmTab />

        {admin.isAdmin ? (
          <TabsContent value="admin" className="mt-0">
            <AdminPanel admin={admin} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
