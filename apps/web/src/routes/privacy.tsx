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
          Effective 21 October 2026. This policy covers{" "}
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
            Once a day we read back page views, daily and monthly active users,
            top pages, and traffic sources from Google Analytics 4 for the
            Pipeline page. We store only those totals, never IP addresses or
            visitor IDs. The site also counts, per story and per day, how often
            a story is opened or its source link clicked. Each count is stored
            with the channel the visit arrived from (for example Telegram,
            email, or Facebook, read from the link's <code>ref</code> or{" "}
            <code>utm_*</code> tag) and no visitor identifier, cookie, or IP
            address. To count a story once per tab and day, your browser keeps a
            key per story in <code>sessionStorage</code>, which it clears when
            the tab closes. AI;DR never stores your IP address. To stop one
            client inflating a count, Cloudflare's rate limiter keeps a
            one-minute counter for your IP address, the story, and the action at
            the nearest Cloudflare location. These counts change one thing: the
            order of stories within a day on the homepage. Opens only multiply a
            story's score by at most 1.03, which can move it a few places and so
            in or out of the first 30 shown. They never add or remove a story
            from a day, a feed, the daily edition, or a post. The extension
            loads no analytics. When you open its new tab, switch language,
            change a section, or click a follow link on it, it sends one
            anonymous request to aidr.today, and we add one to a per-day count
            for that event (and the channel or language, for a click or a
            switch). The count holds no install ID, cookie, or IP address, and
            Cloudflare's rate limiter keeps a one-minute counter for your IP
            address, as above.
          </li>
          <li>
            <strong className="text-foreground">
              Analytics services on the website.
            </strong>{" "}
            There is no consent banner and these load for every visitor a few
            seconds after the page appears. Each one receives your IP address
            and browser details with its requests, as any server does.
            <ul>
              <li>
                Google Analytics 4 sets the <code>_ga</code> cookies and counts
                page views, how long a page stays open, and the events listed
                below. When the tag gateway is on for the domain, it loads
                through the Cloudflare Google tag gateway.
              </li>
              <li>
                PostHog sets a cookie and a <code>localStorage</code> entry with
                a random visitor ID, and records page views and the same events.
                It also autocaptures clicks and form changes on interactive
                elements, captures uncaught errors and unhandled rejections, and
                can record session replays of how you use a page when that is
                switched on in the PostHog project settings. Link addresses and
                request URLs are cleaned of search text and tokens before they
                are sent, and the replay masks request URLs the same way.
              </li>
              <li>
                Jitsu, a collector we run at j.duyet.net, receives one page
                event per page load with the page path, the referrer, and your
                browser details.
              </li>
              <li>
                Seline, a page-view counter, runs only when we switch it on.
              </li>
            </ul>
            The events are the pages you open, clicks on navigation and follow
            links, the story you open or whose source link you click, a topic
            you pick, the length (not the text) of a search, a setting you
            change, signup progress, and page load timings (Core Web Vitals,
            measured in the browser and sent to Google Analytics 4 and PostHog).
            Search text and subscribe tokens are removed from the page addresses
            the site hands these services. Google Analytics can still record a
            search term itself while its site search setting is on. The services
            keep that data under their own policies. To avoid them, block their
            cookies and scripts in your browser, or use a content blocker. The
            site works without them.
          </li>
          <li>
            <strong className="text-foreground">Sign-in.</strong> The sign-in
            pages, and any page once you hold a session, load Clerk, which sets
            its own session cookies to keep you signed in.
          </li>
          <li>
            <strong className="text-foreground">
              Aggregate request counts.
            </strong>{" "}
            For each request to the RSS feeds, the public API, the MCP server,{" "}
            <code>llms.txt</code>, and the Markdown pages, we add one data point
            to a Cloudflare Analytics Engine dataset. It holds the kind of
            request, the route with ids and dates removed, the MCP tool name,
            the response status, and one coarse client type (MCP client, feed
            reader, browser, bot, or other). It holds no IP address, user agent,
            query string, or identifier, and it is used only to see how much
            each surface is read.
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
          <li>
            <strong className="text-foreground">Email digest.</strong> If you
            subscribe, we keep your address, language, delivery settings, the
            page you signed up from, a log of which mails we sent you, and your
            "was this useful" votes under your unsubscribe token. Unsubscribing
            deletes all of it at once. Nothing about you stays behind.
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
