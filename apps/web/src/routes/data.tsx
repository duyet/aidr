import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { SystemPage } from "../components/system/SystemPage";
import { type DataTab, parseDataTab } from "../lib/data-tab";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import { formatTrack, parseTrack } from "../lib/trends";

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
      title: "Pipeline | AI;DR",
      description:
        "How AI;DR collects sources, ranks stories, and publishes the AI news edition.",
      route: headRouteInput(match),
    }),
  component: SystemPage,
});
