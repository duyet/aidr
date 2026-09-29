import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import { ANYROUTER_URL, GITHUB_ALGORITHM_URL, GITHUB_URL } from "../lib/site";

export const Route = createFileRoute("/about")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/about",
      title: "About | AI News",
      route: headRouteInput(match),
    }),
  component: AboutPage,
});

const STEPS: [string, string[]][] = [
  ["Collect", ["hourly pull"]],
  ["Process", ["read, dedupe"]],
  ["Judge", ["JEV + LLM score"]],
  ["Rank", ["importance x quality"]],
  ["Combine", ["one edition"]],
  ["Distribute", ["site", "email", "Telegram"]],
];

const COLUMN = 24;

function center(line: string): string {
  const pad = Math.max(0, COLUMN - line.length);
  return `${" ".repeat(Math.floor(pad / 2))}${line}`;
}

const FLOW = STEPS.flatMap(([title, lines], index) => {
  const block = [center(title), ...lines.map(center)];
  if (index === STEPS.length - 1) return block;
  return [...block, center("|"), center("v")];
}).join("\n");

function PipelineDiagram() {
  return (
    <pre className="not-typeset mx-auto mt-4 w-fit max-w-full overflow-x-auto rounded-2xl border border-border bg-card px-6 py-4 font-mono text-[13px] leading-relaxed text-foreground">
      {FLOW}
    </pre>
  );
}

function AboutPage() {
  return (
    <div className="py-12" lang="en">
      <div className="typeset typeset-page">
        <h1>About AI;DR</h1>
        <p>
          AI;DR is a machine that reads the day's AI news and publishes one
          ranked edition.
        </p>
        <p className="text-muted-foreground">
          People do not pick the order. Each hour the pipeline collects stories,
          processes them, and asks JEV plus an LLM what deserves a place.
          AnyRouter runs those model calls. The result is combined into one
          snapshot, then distributed to the site, email, and Telegram. Every
          story still links back to the original post.
        </p>
      </div>

      <section id="how-it-works" className="mt-10 scroll-mt-20">
        <div className="typeset typeset-page">
          <h2>How it works</h2>
          <p className="text-muted-foreground">Six steps, one hourly run.</p>
        </div>
        <PipelineDiagram />
        <p className="typeset typeset-page mt-4 text-muted-foreground">
          The source list is on the{" "}
          <Link
            to="/data"
            search={{ tab: "sources" }}
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            data sources page
          </Link>
          .
        </p>
      </section>

      <section className="typeset typeset-page mt-10">
        <h2>Judgment and models</h2>
        <p className="text-muted-foreground">
          JEV is the intent gate: it decides whether an item is actually about
          this beat before a score is trusted. The LLM then scores relevance and
          drafts the digest bullets.{" "}
          <a
            href={ANYROUTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            AnyRouter
          </a>{" "}
          is the router in front of those models, so scoring and the digest
          share one path with fallbacks.
        </p>
        <p className="text-muted-foreground">
          Stories are machine-curated. Mistakes happen. A signed-in reader can
          suggest a better line under any story.
        </p>
        <p className="not-typeset mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a
            href={GITHUB_ALGORITHM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:no-underline"
          >
            ALGORITHM.md
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent underline underline-offset-2 hover:no-underline"
          >
            GitHub
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </p>
      </section>
    </div>
  );
}
