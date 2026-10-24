import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { PAGE_LINK, PageSection } from "../components/ContentPage";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import {
  ANYROUTER_URL,
  GITHUB_ALGORITHM_URL,
  GITHUB_URL,
  SUBMIT_EMAIL,
} from "../lib/site";

export const Route = createFileRoute("/about")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/about",
      title: "About | AI;DR",
      description:
        "AI;DR reads the day's AI news and publishes one ranked edition in English and Vietnamese.",
      route: headRouteInput(match),
    }),
  component: AboutPage,
});

const STEPS: [string, string[]][] = [
  ["Collect", ["every 30 minutes"]],
  ["Process", ["read, dedupe"]],
  ["Judge", ["JEV + LLM score"]],
  ["Rank", ["importance x quality"]],
  ["Combine", ["one edition"]],
  ["Distribute", ["site", "email", "Telegram"]],
];

/** One step per line, then a short arrow. Every line stays under 80 columns
 *  so the box fits a phone without a horizontal scrollbar. */
function flowLines(): string[] {
  const lines: string[] = [];
  STEPS.forEach(([title, detail], index) => {
    lines.push(`${title}  ${detail.join(", ")}`);
    if (index < STEPS.length - 1) lines.push("   |", "   v");
  });
  return lines;
}

const FLOW = flowLines().join("\n");

function PipelineDiagram() {
  return (
    <pre className="not-typeset mt-4 w-full overflow-hidden whitespace-pre-wrap rounded-2xl border border-border bg-card px-4 py-4 text-left font-mono text-xs leading-relaxed text-foreground sm:px-6 sm:text-[13px]">
      {FLOW}
    </pre>
  );
}

/** The interactive bench-machine figure (public/how-it-works.html, served
 *  at /how-it-works). It picks up the site theme from this document and
 *  posts its height back so the frame never scrolls. The ASCII flow below
 *  stays as the text version. */
function HowItWorksFigure() {
  const [height, setHeight] = useState(900);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; height?: number };
      if (
        data?.type === "aidr-figure-height" &&
        typeof data.height === "number"
      )
        setHeight(Math.ceil(data.height));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <iframe
      src="/how-it-works"
      title="How AI;DR works: an interactive machine"
      loading="lazy"
      scrolling="no"
      className="not-typeset mt-4 block w-full overflow-hidden border-0"
      style={{ height }}
    />
  );
}

const REPO_LINKS = [
  ["ALGORITHM.md", GITHUB_ALGORITHM_URL],
  ["GitHub", GITHUB_URL],
] as const;

function AboutPage() {
  return (
    <div className="py-12" lang="en">
      <div className="typeset typeset-page">
        <h1>About AI;DR</h1>
        <p>
          AI;DR reads the day's AI news and publishes one ranked edition. It is
          also called AI News, AIDR, AIDR Today, and AI;DR Today, and it lives
          at aidr.today.
        </p>
        <p className="text-muted-foreground">
          No person picks the order. Every 30 minutes the pipeline collects
          stories, including model releases, new kinds of models, and new AI
          labs. JEV and an LLM decide what makes the cut, and AnyRouter runs
          those model calls. The result is one edition on the site, by email, on
          Telegram, on Facebook, and over RSS. Every story links to the original
          post.
        </p>
      </div>

      <section id="how-it-works" className="mt-10 scroll-mt-20">
        <div className="typeset typeset-page">
          <h2>How it works</h2>
          <p className="text-muted-foreground">
            Six steps, one run every 30 minutes.
          </p>
        </div>
        <HowItWorksFigure />
        <PipelineDiagram />
        <p className="typeset typeset-page mt-4 text-muted-foreground">
          See every source on the{" "}
          <Link to="/data" search={{ tab: "sources" }} className={PAGE_LINK}>
            data sources page
          </Link>
          .
        </p>
      </section>

      <div className="typeset typeset-page mt-10">
        <PageSection title="Judgment and models">
          <p>
            JEV rates each story for AI relevance and quality. An LLM takes over
            when JEV is unavailable, and it writes the digest bullets.{" "}
            <a
              href={ANYROUTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={PAGE_LINK}
            >
              AnyRouter
            </a>{" "}
            sits in front of those models, so scoring and the digest share one
            path with fallbacks.
          </p>
          <p>
            A machine picks the stories, so it makes mistakes. Signed-in readers
            can suggest a better line under any story. You can also email{" "}
            <a href={`mailto:${SUBMIT_EMAIL}`}>{SUBMIT_EMAIL}</a> from your
            verified address to send a story, or reply to any AI;DR email with a
            fix.
          </p>
          <p className="not-typeset mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {REPO_LINKS.map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 ${PAGE_LINK}`}
              >
                {label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </p>
        </PageSection>
      </div>
    </div>
  );
}
