import { createFileRoute } from "@tanstack/react-router";
import { ContributeShell } from "../components/contribute/ContributeShell";
import { headRouteInput } from "../lib/head-route";
import { localizedPageHead } from "../lib/seo";

export const Route = createFileRoute("/contribute/")({
  head: ({ match }) =>
    localizedPageHead({
      path: "/contribute",
      title: "Your contributions | AI News",
      lang: match.context.lang,
      route: headRouteInput(match),
    }),
  component: () => <ContributeShell mode="list" />,
});
