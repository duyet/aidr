import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { ContentPage, PageSection } from "../components/ContentPage";
import { headRouteInput } from "../lib/head-route";
import type { RootSearch } from "../lib/locale-routing";
import { pageHead } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export const Route = createFileRoute("/terms")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/terms",
      title: "Terms | aidr.today",
      description: "Terms of use for aidr.today.",
      route: headRouteInput(match),
    }),
  component: TermsPage,
});

const SECTIONS: [string, string][] = [
  [
    "What aidr is",
    "aidr.today collects AI and tech stories from public sources, ranks them with LLMs, and may translate titles and summaries. It is a news digest. It is not advice and not a primary source.",
  ],
  [
    "Accuracy",
    "A machine picks and translates every story. Titles, summaries, rankings, and tags can be wrong or out of date. Check important claims against the original source linked on each story.",
  ],
  [
    "Accounts and contributions",
    "Signing in with Clerk lets you submit stories and suggest better translations. Do not submit illegal, abusive, or deceptive content. We may reject, edit, or remove any submission.",
  ],
  [
    "Acceptable use",
    "Do not scrape the site hard enough to slow it down, abuse signed-in APIs, get around rate limits, or use the service to spam people. Public feeds and MCP access come as-is and may change.",
  ],
  [
    "Intellectual property",
    "aidr branding, UI, and generated digests are for personal, non-commercial reading unless we say otherwise. Publishers keep ownership of their article titles, links, and content.",
  ],
  [
    "Disclaimer",
    'The service is provided "as is" with no warranty. As far as the law allows, we are not liable for decisions you make based on what you read here.',
  ],
  [
    "Changes",
    "We may update these terms by posting a new version on this page. Using the site after a change means you accept it.",
  ],
];

function TermsPage() {
  return (
    <ContentPage
      title="Terms of use"
      lede={
        <>
          Effective 5 September 2026. These terms cover{" "}
          <a href={SITE_URL}>{SITE_URL}</a>. Contact{" "}
          <a href="mailto:me@duyet.net">me@duyet.net</a>.
        </>
      }
    >
      {SECTIONS.map(([title, body]) => (
        <PageSection key={title} title={title}>
          <p>{body}</p>
        </PageSection>
      ))}
      <p>
        <Link to="/privacy">Privacy</Link>
        {" · "}
        <Link to="/about">About</Link>
      </p>
    </ContentPage>
  );
}
