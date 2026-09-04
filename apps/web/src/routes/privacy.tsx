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
    <article className="mx-auto max-w-2xl py-10 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p className="mt-2 text-muted-foreground">
        Effective 4 September 2026. This policy covers the website{" "}
        <a href={SITE_URL} className="underline underline-offset-2">
          {SITE_URL}
        </a>{" "}
        and the aidr Chrome new-tab extension. Contact:{" "}
        <a href="mailto:me@duyet.net" className="underline underline-offset-2">
          me@duyet.net
        </a>
        .
      </p>

      <h2 className="mt-8 text-base font-semibold">Single purpose</h2>
      <p className="mt-2 text-muted-foreground">
        The extension replaces Chrome&apos;s new tab with the public AI;DR
        digest and top stories from aidr.today. That is its only purpose.
      </p>

      <h2 className="mt-8 text-base font-semibold">What we collect</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Website content.</strong> The
          extension fetches public JSON from{" "}
          <code className="text-foreground">https://aidr.today/api/public</code>{" "}
          and, when available,{" "}
          <code className="text-foreground">/api/feed</code>. That payload is
          story titles, URLs, short summaries, tags, and thumbnail URLs already
          published on the site. It is not your browsing history.
        </li>
        <li>
          <strong className="text-foreground">Local settings and cache.</strong>{" "}
          Theme, language, and a short copy of the last digest are stored in{" "}
          <code className="text-foreground">chrome.storage</code> on your device
          so a new tab still paints if the network is down.
        </li>
      </ul>
      <p className="mt-3 text-muted-foreground">
        There is no account, no analytics SDK, no advertising, and no sale of
        data. We do not use the data for purposes other than showing the digest.
      </p>

      <h2 className="mt-8 text-base font-semibold">Permissions</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>
          <code className="text-foreground">storage</code> — settings and the
          local digest cache.
        </li>
        <li>
          <code className="text-foreground">https://aidr.today/*</code> — fetch
          the public digest. No other hosts.
        </li>
        <li>
          Optional <code className="text-foreground">localhost</code> /{" "}
          <code className="text-foreground">127.0.0.1</code> — only if you point
          the API base at a local Worker. Chrome asks before this is granted.
        </li>
      </ul>

      <h2 className="mt-8 text-base font-semibold">Remote code</h2>
      <p className="mt-2 text-muted-foreground">
        All extension logic ships inside the package. New-tab pages do not load
        or execute scripts from the network.
      </p>

      <h2 className="mt-8 text-base font-semibold">Sharing and retention</h2>
      <p className="mt-2 text-muted-foreground">
        The public JSON fetch goes to aidr.today (Cloudflare Worker). We do not
        share extension settings with anyone. Local cache stays on the device
        until you clear site/extension data or uninstall.
      </p>

      <h2 className="mt-8 text-base font-semibold">Changes</h2>
      <p className="mt-2 text-muted-foreground">
        If data handling changes, this page is updated and the extension listing
        is updated before the new version ships.
      </p>

      <p className="mt-8">
        <Link to="/extension" className="underline underline-offset-2">
          Chrome new tab install
        </Link>
      </p>
    </article>
  );
}
