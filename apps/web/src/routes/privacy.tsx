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

export const Route = createFileRoute("/privacy")({
  search: {
    middlewares: [stripSearchParams<RootSearch>(["lang", "locale"])],
  },
  head: ({ match }) =>
    pageHead({
      path: "/privacy",
      title: "Privacy | aidr.today",
      description:
        "Privacy policy for aidr.today and the aidr Chrome new-tab extension.",
      route: headRouteInput(match),
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <ContentPage
      title="Privacy"
      lede={
        <>
          Effective 4 September 2026. This policy covers{" "}
          <a href={SITE_URL}>{SITE_URL}</a> and the aidr Chrome new-tab
          extension. Contact <a href="mailto:me@duyet.net">me@duyet.net</a>.
        </>
      }
    >
      <PageSection title="Single purpose">
        <p>
          The extension replaces Chrome's new tab with the public AI;DR digest
          and top stories from aidr.today. It does nothing else.
        </p>
      </PageSection>

      <PageSection title="What we collect">
        <ul>
          <li>
            <strong className="text-foreground">Website content.</strong> The
            extension fetches public JSON from{" "}
            <code>https://aidr.today/api/public</code> and, when available,{" "}
            <code>/api/feed</code>. It holds story titles, URLs, summaries,
            tags, and thumbnail URLs already on the site. It is not your
            browsing history.
          </li>
          <li>
            <strong className="text-foreground">Site traffic totals.</strong>{" "}
            The website loads Google Analytics 4 to count page views. Once a day
            we read back page views, daily and monthly active users, top pages,
            and traffic sources for the Pipeline page. We store only those
            totals, never IP addresses or visitor IDs. The site also counts, per
            story and per day, how often a story is opened or its source link
            clicked. Each count is stored with the channel the visit arrived
            from (for example Telegram, email, or Facebook, read from the link's{" "}
            <code>ref</code> or <code>utm_*</code> tag) and no visitor
            identifier, cookie, or IP address. To count a story once per tab and
            day, your browser keeps a key per story in{" "}
            <code>sessionStorage</code>, which it clears when the tab closes. AI;DR never
            stores your IP address. To stop one client inflating a count,
            Cloudflare's rate limiter keeps a one-minute counter for your
            IP address, the story, and the action at the nearest Cloudflare
            location. The extension loads no analytics.
          </li>
          <li>
            <strong className="text-foreground">
              Local settings and cache.
            </strong>{" "}
            Theme, language, and a copy of the last digest live in{" "}
            <code>chrome.storage</code> on your device, so a new tab still shows
            news when you are offline.
          </li>
          <li>
            <strong className="text-foreground">Email contributions.</strong> If
            you sign in and mail submit@aidr.today, we keep the text you wrote
            (not quoted mail or attachments), its links, and the sending address
            until we acknowledge it. Then we drop the address. Text kept as a
            comment is cleared after 90 days. Mail from an address with no
            account keeps no content, only a reason and a hash.
          </li>
        </ul>
        <p>
          No account, no ads, and no sale of data. We use the data only to show
          the digest and report traffic totals.
        </p>
      </PageSection>

      <PageSection title="Permissions">
        <ul>
          <li>
            <code>storage</code> holds settings and the local digest cache.
          </li>
          <li>
            <code>https://aidr.today/*</code> fetches the public digest. No
            other hosts.
          </li>
          <li>
            Optional <code>localhost</code> and <code>127.0.0.1</code> are only
            for pointing the extension at a local Worker. Chrome asks first.
          </li>
        </ul>
      </PageSection>

      <PageSection title="Remote code">
        <p>
          All extension code ships in the package. New-tab pages never load
          scripts from the network.
        </p>
      </PageSection>

      <PageSection title="Sharing and retention">
        <p>
          The public JSON request goes to aidr.today, a Cloudflare Worker. We
          share extension settings with no one. The local cache stays on your
          device until you clear extension data or uninstall.
        </p>
      </PageSection>

      <PageSection title="Changes">
        <p>
          If data handling changes, we update this page and the extension
          listing before the new version ships.
        </p>
      </PageSection>

      <p>
        <Link to="/terms">Terms of use</Link>
      </p>
    </ContentPage>
  );
}
