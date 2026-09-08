import { createFileRoute, Link } from "@tanstack/react-router";
import { pageHead } from "../lib/seo";
import { SITE_URL } from "../lib/site";

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      path: "/terms",
      title: "Terms | aidr.today",
      description: "Terms of use for aidr.today.",
    }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <article className="typeset typeset-page py-12">
      <h1>Terms of use</h1>
      <p className="text-muted-foreground">
        Effective 5 September 2026. These terms cover the website{" "}
        <a href={SITE_URL}>{SITE_URL}</a>. Contact:{" "}
        <a href="mailto:me@duyet.net">me@duyet.net</a>.
      </p>

      <h2>What aidr is</h2>
      <p className="text-muted-foreground">
        aidr.today aggregates AI and tech stories from public sources, scores
        and ranks them with LLMs, and may translate titles and summaries. It is
        an editorial digest, not advice, not a brokerage, and not a primary
        source of record.
      </p>

      <h2>Accuracy</h2>
      <p className="text-muted-foreground">
        Stories are machine-curated and machine-translated. Titles, summaries,
        rankings, and tags can be wrong, incomplete, outdated, or biased. Always
        verify important claims against the original source linked on each
        story.
      </p>

      <h2>Accounts and contributions</h2>
      <p className="text-muted-foreground">
        Signing in (via Clerk) lets you submit stories or suggest better
        translations. You must not submit illegal, abusive, or deceptive
        content. We may reject, edit, or remove submissions without notice.
      </p>

      <h2>Acceptable use</h2>
      <p className="text-muted-foreground">
        Do not scrape the site in a way that harms availability, abuse
        authenticated APIs, attempt to bypass rate limits, or use the service to
        spam others. Public feeds and MCP access are provided as-is and may
        change.
      </p>

      <h2>Intellectual property</h2>
      <p className="text-muted-foreground">
        Original aidr branding, UI, and generated digests are provided for
        personal and non-commercial reading unless we say otherwise. Third-party
        article titles, links, and content remain owned by their publishers.
      </p>

      <h2>Disclaimer</h2>
      <p className="text-muted-foreground">
        The service is provided “as is” without warranties of any kind. To the
        fullest extent allowed by law, we are not liable for decisions you make
        based on anything you read here.
      </p>

      <h2>Changes</h2>
      <p className="text-muted-foreground">
        We may update these terms by posting a new version on this page.
        Continued use after a change means you accept the updated terms.
      </p>

      <p>
        <Link to="/privacy">Privacy</Link>
        {" · "}
        <Link to="/about">About</Link>
      </p>
    </article>
  );
}
