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
import { EVENTS, type EventName } from "../src/lib/analytics/events";
import type { Spec } from "../src/lib/analytics/schema";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = join(webDir, "..", "..");
export const SRC_DIR = join(webDir, "src");
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

export function renderEventsDoc(callSites: Map<string, string[]>): string {
  const rows = (Object.keys(EVENTS) as EventName[]).map((name) => {
    const row = EVENTS[name];
    const sinks = "sinks" in row ? row.sinks.join(", ") : "ga4, posthog";
    const files = (callSites.get(name) ?? []).map((f) => `\`${f}\``);
    return `| \`${name}\` | ${row.sender} | ${sinks} | ${paramsCell(row.params)} | ${files.join("<br>")} | ${cell(row.question)} |`;
  });
  const dims = dimensions().map(
    (d) =>
      `| \`${d.name}\` | Event | ${describeSpec(d.spec)} | ${d.events.map((e) => `\`${e}\``).join(", ")} |`
  );
  return `# Analytics events

Generated from \`apps/web/src/lib/analytics/events.ts\` by \`${REGENERATE}\`. Do not edit by hand.

Every event the site sends is a row in the registry. \`track(name, params)\` accepts only registry names and their exact params, so a wrong name, a missing or extra param, or an enum value outside its list fails \`check-types\`. At runtime, keys outside the row are dropped and each value must pass its kind. No kind accepts free text: a param holds an item id, an enum value, a number, a pathname without its query, a slug written in code, or a category or tag name from the feed. PostHog events also carry \`surface: "web"\`.

To add an event, add a row with the product question it answers, call \`track()\`, and rerun the command above.

## Events

| Event | Sender | Sinks | Params | Fires from | Question |
| --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## GA4 custom dimensions

GA4 reports a param only after it is registered as a custom dimension, and registration is not retroactive. Register these in GA4 Admin > Custom definitions before deploying a change that adds one. A param shared by several events is one dimension, and its values are the union across those events.

| Parameter | Scope | Values | Events |
| --- | --- | --- | --- |
${dims.join("\n")}

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
