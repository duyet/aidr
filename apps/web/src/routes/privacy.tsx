import { createFileRoute, Link } from "@tanstack/react-router";
import { SITE_URL } from "../lib/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy | aidr.today" },
      {
        name: "description",
        content:
          "Privacy policy for aidr.today and the aidr Chrome new-tab extension.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <article className="typeset typeset-page py-12">
      <h1>Privacy</h1>
      <p className="text-muted-foreground">
        Effective 4 September 2026. This policy covers the website{" "}
        <a href={SITE_URL}>{SITE_URL}</a> and the aidr Chrome new-tab extension.
        Contact: <a href="mailto:me@duyet.net">me@duyet.net</a>.
      </p>

      <h2>Single purpose</h2>
      <p className="text-muted-foreground">
        The extension replaces Chrome&apos;s new tab with the public AI;DR
        digest and top stories from aidr.today. That is its only purpose.
      </p>

      <h2>What we collect</h2>
      <ul className="text-muted-foreground">
        <li>
          <strong className="text-foreground">Website content.</strong> The
          extension fetches public JSON from{" "}
          <code>https://aidr.today/api/public</code> and, when available,{" "}
          <code>/api/feed</code>. That payload is story titles, URLs, short
          summaries, tags, and thumbnail URLs already published on the site. It
          is not your browsing history.
        </li>
        <li>
          <strong className="text-foreground">Local settings and cache.</strong>{" "}
          Theme, language, and a short copy of the last digest are stored in{" "}
          <code>chrome.storage</code> on your device so a new tab still paints
          if the network is down.
        </li>
      </ul>
      <p className="text-muted-foreground">
        There is no account, no analytics SDK, no advertising, and no sale of
        data. We do not use the data for purposes other than showing the digest.
      </p>

      <h2>Permissions</h2>
      <ul className="text-muted-foreground">
        <li>
          <code>storage</code> — settings and the local digest cache.
        </li>
        <li>
          <code>https://aidr.today/*</code> — fetch the public digest. No other
          hosts.
        </li>
        <li>
          Optional <code>localhost</code> / <code>127.0.0.1</code> — only if you
          point the API base at a local Worker. Chrome asks before this is
          granted.
        </li>
      </ul>

      <h2>Remote code</h2>
      <p className="text-muted-foreground">
        All extension logic ships inside the package. New-tab pages do not load
        or execute scripts from the network.
      </p>

      <h2>Sharing and retention</h2>
      <p className="text-muted-foreground">
        The public JSON fetch goes to aidr.today (Cloudflare Worker). We do not
        share extension settings with anyone. Local cache stays on the device
        until you clear site/extension data or uninstall.
      </p>

      <h2>Changes</h2>
      <p className="text-muted-foreground">
        If data handling changes, this page is updated and the extension listing
        is updated before the new version ships.
      </p>

      <p>
        <Link to="/terms">Terms of use</Link>
      </p>
    </article>
  );
}
