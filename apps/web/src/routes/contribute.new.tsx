import { createFileRoute } from "@tanstack/react-router";
import { ContributeShell } from "../components/contribute/ContributeShell";
import { headRouteInput } from "../lib/head-route";
import { localizedPageHead } from "../lib/seo";

export const Route = createFileRoute("/contribute/new")({
  head: ({ match }) =>
    localizedPageHead({
      path: "/contribute/new",
      title: "Submit a story | AI News",
      lang: match.context.lang,
      route: headRouteInput(match),
    }),
  component: () => <ContributeShell mode="new" />,
});
