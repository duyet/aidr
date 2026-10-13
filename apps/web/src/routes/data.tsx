import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aidr/ui";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { AdminPanel } from "../components/system/AdminPanel";
import { AlgoTab } from "../components/system/AlgoTab";
import { AudienceTab } from "../components/system/AudienceTab";
import { ContentTab } from "../components/system/ContentTab";
import { LlmTab } from "../components/system/LlmTab";
import { ModelAttribution } from "../components/system/ModelAttribution";
import { OverviewTab } from "../components/system/OverviewTab";
import { RunsTab } from "../components/system/RunsTab";
import { SourcesTab } from "../components/system/SourcesTab";
import { TrendsTab } from "../components/system/TrendsTab";
import { TAB_PANEL } from "../components/system/tab-spacing";
import { useAdmin } from "../lib/admin";
import { type DataTab, dataTabSearch, parseDataTab } from "../lib/data-tab";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import { formatTrack, parseTrack } from "../lib/trends";
import type { Lang } from "../lib/types";

export interface DataSearch {
  tab?: DataTab;
  /** Deep link from the footer: expand and scroll to this workflow run. */
  run?: string;
  /** Trends tab: comma-separated pinned topics/models. */
  track?: string;
}

export const Route = createFileRoute("/data")({
  validateSearch: (search: Record<string, unknown>): DataSearch => {
    const tab = parseDataTab(search.tab);
    const run =
      typeof search.run === "string" && search.run.trim()
        ? search.run.trim()
        : undefined;
    const track = formatTrack(parseTrack(search.track));
    return {
      ...(tab ? { tab } : {}),
      ...(run ? { run } : {}),
      ...(track ? { track } : {}),
    };
  },
  search: {
    middlewares: [
      stripSearchParams<DataSearch & RootSearch>(["lang", "locale"]),
    ],
  },
  head: ({ match }) =>
    pageHead({
      path: "/data",
      title: "Pipeline | AI News",
      description:
        "How AI;DR collects sources, ranks stories, and publishes the AI news edition.",
      route: headRouteInput(match),
    }),
  component: SystemPage,
});

const TABS: { value: DataTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "audience", label: "Audience" },
  { value: "content", label: "Content" },
  { value: "trends", label: "Trends" },
  { value: "runs", label: "Runs" },
  { value: "sources", label: "Sources" },
  { value: "llm", label: "LLM" },
  { value: "algo", label: "Algo" },
];

const TAB_TRIGGER =
  "-mb-px h-9 rounded-none border-b-2 border-transparent bg-transparent px-3 py-0 text-sm text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

export function SystemPage() {
  // /data is an operator page: English only, whatever the site language.
  const lang: Lang = "en";
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
            <span className="mt-1 block font-mono text-xs">
              AI;DR {import.meta.env.VITE_AIDR_VERSION || "dev"}
              {import.meta.env.VITE_AIDR_SHA
                ? ` · ${import.meta.env.VITE_AIDR_SHA}`
                : ""}
            </span>
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
              search: dataTabSearch(parsed, search),
              replace: true,
            });
          }}
        >
          {/* Underline tabs on a hairline: the strip is navigation, not a
              surface, so it carries no fill; TAB_PANEL sets the gap below. */}
          <TabsList className="h-auto w-full flex-wrap justify-start gap-0 rounded-none border-b border-border/70 bg-transparent p-0">
            {TABS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className={TAB_TRIGGER}>
                {label}
              </TabsTrigger>
            ))}
            {admin.isAdmin ? (
              <TabsTrigger value="admin" className={TAB_TRIGGER}>
                Admin
              </TabsTrigger>
            ) : null}
          </TabsList>

          <OverviewTab />
          <AudienceTab lang={lang} />
          <AlgoTab />
          <ContentTab lang={lang} />
          <TrendsTab
            track={parseTrack(search.track)}
            onTrackChange={(next) =>
              void navigate({
                search: { tab: "trends", track: formatTrack(next) },
                replace: true,
              })
            }
          />
          <RunsTab lang={lang} focusRunId={search.run} />
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
