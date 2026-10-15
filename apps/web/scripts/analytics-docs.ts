/**
 * Writes docs/analytics-events.md from the event registry and the `track()`
 * calls in apps/web/src. src/lib/analytics/events-doc.test.ts fails when the
 * file is stale.
 *
 *   pnpm --filter @aidr/web analytics:docs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  EVENTS,
  type EventName,
  EXTENSION_EVENTS,
} from "../src/lib/analytics/events";
import type { Spec } from "../src/lib/analytics/schema";
import { VENDOR_EVENTS } from "../src/lib/analytics/vendor-events";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = join(webDir, "..", "..");
export const SRC_DIR = join(webDir, "src");
export const EXTENSION_DIR = join(repoDir, "apps", "extension", "js");
export const DOC_PATH = join(repoDir, "docs", "analytics-events.md");
export const REGENERATE = "pnpm --filter @aidr/web analytics:docs";

const CALL_RE = /\btrack\(\s*"([a-z0-9_]+)"/g;

/** Event name -> sorted repo-relative files that call `track("<name>"`. */
export function findCallSites(srcDir = SRC_DIR): Map<string, string[]> {
  const sites = new Map<string, Set<string>>();
  for (const entry of readdirSync(srcDir, { recursive: true })) {
    const file = String(entry);
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue;
    const text = readFileSync(join(srcDir, file), "utf8");
    for (const [, name] of text.matchAll(CALL_RE)) {
      const files = sites.get(name) ?? new Set<string>();
      files.add(relative(repoDir, join(srcDir, file)));
      sites.set(name, files);
    }
  }
  return new Map([...sites].map(([name, files]) => [name, [...files].sort()]));
}

const EXTENSION_CALL_RES = [
  /\btrack\(\s*"([a-z0-9_]+)"/g,
  // trackChannelClick(channel, params) sends the channel_click event.
  /\b(trackChannelClick)\(/g,
];

/** Extension event name -> sorted repo-relative files that send it. */
export function findExtensionCallSites(
  dir = EXTENSION_DIR
): Map<string, string[]> {
  const sites = new Map<string, Set<string>>();
  for (const entry of readdirSync(dir)) {
    if (!/\.js$/.test(entry) || /\.test\.js$/.test(entry)) continue;
    const text = readFileSync(join(dir, entry), "utf8");
    for (const re of EXTENSION_CALL_RES) {
      for (const [, found] of text.matchAll(re)) {
        const name = found === "trackChannelClick" ? "channel_click" : found;
        const files = sites.get(name) ?? new Set<string>();
        files.add(relative(repoDir, join(dir, entry)));
        sites.set(name, files);
      }
    }
  }
  return new Map([...sites].map(([name, files]) => [name, [...files].sort()]));
}

function describeSpec(spec: Spec): string {
  switch (spec.kind) {
    case "enum":
      return spec.values.map((v) => `\`${v}\``).join(", ");
    case "item_id":
      return "item id (hex)";
    case "count":
      return "integer ≥ 0";
    case "number":
      return "number";
    case "path":
      return "pathname";
    case "slug":
      return "code slug";
    case "label":
      return "feed label";
  }
}

const cell = (text: string) => text.replaceAll("|", "\\|");

function paramsCell(params: Record<string, Spec>): string {
  return Object.entries(params)
    .map(
      ([name, spec]) =>
        `\`${name}${spec.optional ? "?" : ""}\`: ${describeSpec(spec)}`
    )
    .join("<br>");
}

type Dimension = { name: string; spec: Spec; events: string[] };

/** One GA4 event-scoped dimension per param name; enum values unioned. */
function dimensions(): Dimension[] {
  const byName = new Map<string, Dimension>();
  for (const [event, row] of Object.entries(EVENTS)) {
    for (const [name, spec] of Object.entries(
      row.params as Record<string, Spec>
    )) {
      if (!spec.dimension) continue;
      const dim = byName.get(name);
      if (!dim) {
        byName.set(name, { name, spec, events: [event] });
        continue;
      }
      dim.events.push(event);
      if (dim.spec.kind === "enum" && spec.kind === "enum") {
        const values = [...new Set([...dim.spec.values, ...spec.values])];
        dim.spec = { ...dim.spec, values };
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderEventsDoc(
  callSites: Map<string, string[]>,
  extensionSites: Map<string, string[]> = findExtensionCallSites()
): string {
  const rows = (Object.keys(EVENTS) as EventName[]).map((name) => {
    const row = EVENTS[name];
    const sinks = "sinks" in row ? row.sinks.join(", ") : "ga4, posthog";
    const files = (callSites.get(name) ?? []).map((f) => `\`${f}\``);
    return `| \`${name}\` | ${row.sender} | ${sinks} | ${paramsCell(row.params)} | ${files.join("<br>")} | ${cell(row.question)} |`;
  });
  const extensionRows = Object.entries(EXTENSION_EVENTS).map(([name, row]) => {
    const files = (extensionSites.get(name) ?? []).map((f) => `\`${f}\``);
    const params = paramsCell(row.params as Record<string, Spec>) || "none";
    return `| \`${name}\` | ${params} | ${files.join("<br>")} | ${cell(row.question)} |`;
  });
  const vendorRows = VENDOR_EVENTS.map(
    (e) =>
      `| ${e.vendor} | \`${e.event}\` | ${cell(e.fires)} | ${cell(e.handling)} |`
  );
  const dims = dimensions().map(
    (d) =>
      `| \`${d.name}\` | Event | ${describeSpec(d.spec)} | ${d.events.map((e) => `\`${e}\``).join(", ")} |`
  );
  return `# Analytics events

Generated from \`apps/web/src/lib/analytics/events.ts\` by \`${REGENERATE}\`. Do not edit by hand.

Every event the app sends is a row in the registry. Two kinds are not rows in the table below: events the Chrome extension sends, listed under Extension events, and events a vendor script sends by itself, listed under Vendor automatic events. \`track(name, params)\` accepts only registry names and their exact params, so a wrong name, a missing or extra param, or an enum value outside its list fails \`check-types\`. At runtime, keys outside the row are dropped and each value must pass its kind. No kind accepts free text: a param holds an item id, an enum value, a number, a pathname without its query, a slug written in code, or a category or tag name from the feed. PostHog events also carry \`surface: "web"\`.

To add an event, add a row with the product question it answers, call \`track()\`, and rerun the command above.

## Events

| Event | Sender | Sinks | Params | Fires from | Question |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## Extension events

The Chrome extension has no analytics SDK (its privacy policy forbids one). It sends each event as a GET to \`/api/extension\`, tagged \`ref=extension\` and the \`utm_*\` params listed under Outgoing link tags, with the event name and its params joined into \`utm_content\`. The route ignores the query and returns the release JSON, so these events reach no vendor and exist only in Cloudflare request logs. Rows are \`EXTENSION_EVENTS\` in the registry file. Where a name matches a web event, the param set is the extension's own: \`prefs_change\` uses \`to\` where the web row uses \`pref_value\`, and \`channel_click\` has no \`placement\`.

| Event | Params | Fires from | Question |
| --- | --- | --- | --- |
${extensionRows.join("\n")}

## Vendor automatic events

These are sent by vendor scripts without a \`track()\` call, so they are not registry rows and app code cannot change their params. The list is \`VENDOR_EVENTS\` in \`apps/web/src/lib/analytics/vendor-events.ts\`.

| Vendor | Event | Fires | Handling |
| --- | --- | --- | --- |
${vendorRows.join("\n")}

Seline loads only when \`VITE_SELINE_TOKEN\` is set and records its own page views. No custom event goes to it.

## GA4 custom dimensions

GA4 reports a param only after it is registered as a custom dimension, and registration is not retroactive. Register these in GA4 Admin > Custom definitions before deploying a change that adds one. A param shared by several events is one dimension, and its values are the union across those events.

| Parameter | Scope | Values | Events |
| --- | --- | --- | --- |
${dims.join("\n")}

## Outgoing link tags

\`channel_landing\` reads the UTM params below from the landing URL. Every aidr.today link we post carries all four, built by \`apps/web/worker/utm.ts\` (the video scripts use \`videos/daily-news/scripts/site-links.mjs\`, and YouTube descriptions get theirs in \`yt-meta.py\`). \`apps/web/worker/__tests__/outbound-links.test.ts\` renders each surface and fails on an untagged aidr.today link. Third-party URLs, URLs that already have \`utm_*\`, and links with a subscriber token (settings, unsubscribe, feedback) are never tagged. \`lang\` is kept as its own param.

| Channel | \`utm_source\` | \`utm_medium\` | \`utm_campaign\` | \`utm_content\` |
| --- | --- | --- | --- | --- |
| Email digest | \`email\` | \`digest\` | \`digest-YYYY-MM-DD\`, \`weekly-YYYY-Www\` | \`lead\`, \`s2\`..., \`cta\`, \`header\`, \`view-in-browser\`, \`lang-switch\`, \`video\`, \`channel-*\`, \`footer-data\`, \`footer-subscribe\` |
| Email welcome, notes | \`email\` | \`welcome\`, \`notes\` | same as medium | \`cta\`, \`header\`, \`body\`, \`footer-*\` |
| Telegram (posts, day videos, release videos) | \`telegram\` | \`social\` | \`digest-YYYY-MM-DD\`, \`story\`, \`release-vX.Y.Z\` | \`button\`, \`link\`, \`preview\` |
| Facebook (posts, Reels) | \`facebook\` | \`social\` | \`digest-YYYY-MM-DD\` or \`story\` | \`post\`, \`reel\` |
| YouTube descriptions | \`youtube\` | \`video\` | \`digest-YYYY-MM-DD\`, \`weekly-YYYY-Www\`, \`release-vX.Y.Z\` | \`long\`, \`short\` |
| RSS feed | \`rss\` | \`feed\` | \`story\` | \`item\`, \`channel\` |
| Extension | \`extension\` | \`newtab\` | \`aidr_ext\` | placement (\`brand\`, \`tldr\`, ...) |

\`social\` is GA4's default-channel-group medium for Organic Social, and \`video\` with source \`youtube\` is Organic Video. Email keeps the mail kind as medium, and the edition is the campaign. The RSS \`<guid>\` stays the untagged permalink, so readers do not re-show items. Public API, MCP and \`llms.txt\` permalinks stay untagged: they are canonical ids that agents cite, not links a reader clicks in a channel.

## GA4 Enhanced Measurement

Turn these off in GA4 Admin > Data streams > Enhanced measurement:

- Page changes based on browser history events. \`page_view\` is sent by the app on every route change, so this would count each one twice. It also reads the raw URL, including \`?q=\`.
- Site search. It copies \`?q=\` into \`search_term\`, which puts reader search text in GA4.
- Outbound clicks. \`source_click\` already records source-link clicks with the item id.
- Form interactions. \`form_submit\` copies the form's URL, including \`?q=\`, into \`form_destination\`.

App code cannot change what these send, because they read the browser URL themselves.

PostHog captures its own \`$pageview\`, so \`page_view\` goes to GA4 only.

## Page URLs

The app hands every vendor a sanitized page URL. GA4 \`page_location\` and \`page_referrer\`, PostHog URL properties and autocaptured link hrefs, and the Jitsu page event keep only the query params in \`SAFE_PARAMS\` (\`apps/web/src/lib/analytics/url-privacy.ts\`). Search text (\`q\`) and the subscribe tokens are dropped. An inline \`<head>\` script moves a subscribe token out of the URL before any vendor script runs.
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  writeFileSync(DOC_PATH, renderEventsDoc(findCallSites()));
  console.log(`wrote ${relative(repoDir, DOC_PATH)}`);
}
