import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aidr/ui";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AdminPanel } from "../components/system/AdminPanel";
import { AlgoTab } from "../components/system/AlgoTab";
import { ContentTab } from "../components/system/ContentTab";
import { LlmTab } from "../components/system/LlmTab";
import { ModelAttribution } from "../components/system/ModelAttribution";
import { OverviewTab } from "../components/system/OverviewTab";
import { RunsTab } from "../components/system/RunsTab";
import { SourcesTab } from "../components/system/SourcesTab";
import { TAB_PANEL } from "../components/system/tab-spacing";
import { useAdmin } from "../lib/admin";
import { type DataTab, parseDataTab } from "../lib/data-tab";
import { useLang } from "../lib/lang-context";
import type { RootSearch } from "../lib/locale-routing";
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
  search: {
    middlewares: [
      stripSearchParams<DataSearch & RootSearch>(["lang", "locale"]),
    ],
  },
  head: () =>
    pageHead({
      path: "/data",
      title: "Pipeline | AI News",
    }),
  component: SystemPage,
});

const TABS: { value: DataTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "content", label: "Content" },
  { value: "runs", label: "Runs" },
  { value: "sources", label: "Sources" },
  { value: "llm", label: "LLM" },
  { value: "algo", label: "Algo" },
];

export function SystemPage() {
  const lang: Lang = useLang();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const admin = useAdmin();
  const tab: DataTab =
    search.tab === "admin" && !admin.isAdmin && !admin.loading
      ? "overview"
      : (search.tab ?? "overview");

  return (
    <div className="news-content news-data py-8 sm:py-10">
      <div className="space-y-6">
        <header>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">
            Pipeline
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live ingest, content, and token use.
          </p>
        </header>

        {/* One quiet full-width strip instead of a loud header card: the
            model chain is context for the metrics below, not a headline. */}
        <ModelAttribution />

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
          {/* Comfortable pill: p-1.5/gap-1.5 so triggers never touch the
              strip edge, and a matching TAB_PANEL gap below so no card is
              glued to the tabs. */}
          <TabsList className="h-auto min-h-11 w-full flex-wrap justify-start gap-1.5 rounded-xl bg-muted/40 p-1.5">
            {TABS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-lg px-4 py-2 text-sm"
              >
                {label}
              </TabsTrigger>
            ))}
            {admin.isAdmin ? (
              <TabsTrigger
                value="admin"
                className="rounded-lg px-4 py-2 text-sm"
              >
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
            <TabsContent value="admin" className={TAB_PANEL}>
              <AdminPanel admin={admin} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
