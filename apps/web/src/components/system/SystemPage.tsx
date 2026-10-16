import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aidr/ui";
import { useAdmin } from "../../lib/admin";
import { type DataTab, dataTabSearch, parseDataTab } from "../../lib/data-tab";
import { formatTrack, parseTrack } from "../../lib/trends";
import type { Lang } from "../../lib/types";
import { Route } from "../../routes/data";
import { AdminPanel } from "./AdminPanel";
import { AlgoTab } from "./AlgoTab";
import { AudienceTab } from "./AudienceTab";
import { ContentTab } from "./ContentTab";
import { LlmTab } from "./LlmTab";
import { ModelAttribution } from "./ModelAttribution";
import { OverviewTab } from "./OverviewTab";
import { RunsTab } from "./RunsTab";
import { SourcesTab } from "./SourcesTab";
import { TrendsTab } from "./TrendsTab";
import { TAB_PANEL } from "./tab-spacing";

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
