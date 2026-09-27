/**
 * Live feed verification for every row in the declarative source registry
 * (`worker/sources/catalog.ts`).
 *
 * This is the evidence tool behind the "verified live before it is added"
 * rule in `worker/sources/registry.ts`. It deliberately runs the SAME parser
 * the Worker runs (`parseRssItems` for `rss` rows, plus the arXiv flood gate
 * and the AI-keyword pre-filter) so a green result here means the production
 * code path can actually read the feed — not that some ad-hoc regex agreed.
 *
 * Per source it reports: HTTP status, redirect target, content type, byte
 * size, item count after the production filter chain, the newest item date,
 * how many items carry a real title + absolute URL + parseable date, and a
 * snapshot of the first 3 parsed items.
 *
 * Usage:
 *   pnpm --filter @aidr/web exec tsx scripts/verify-source-feeds.ts
 *   pnpm --filter @aidr/web exec tsx scripts/verify-source-feeds.ts arxiv-ai
 *   pnpm --filter @aidr/web exec tsx scripts/verify-source-feeds.ts --json
 *
 * Exit code is 1 when any row fails, so CI / a pre-merge check can use it.
 */

import { SOURCE_REGISTRY } from "../worker/sources/catalog.js";
import { applyFloodGate, parseRssItems } from "../worker/sources/rss.js";

interface ProbeResult {
  id: string;
  name: string;
  type: string;
  url: string;
  status: number;
  ok: boolean;
  finalUrl: string;
  contentType: string;
  bytes: number;
  /** Items the production parser read out of the body. */
  rawItems: number;
  /** Items inside the pipeline's 26h since-window, before the flood gate. */
  inWindow: number;
  /** Items the Worker would actually return this run: window + flood gate. */
  items: number;
  /** Newest / oldest usable item anywhere in the feed. */
  newest: string;
  oldest: string;
  usable: number;
  skipped: string[];
  gate: { keywordFilter: string | null; maxItems: number | null };
  /** Newest items the Worker would return this run (window + flood gate). */
  first3: { title: string; url: string; publishedAt: string }[];
  /** Newest usable items anywhere in the feed, for a quiet-source snapshot. */
  newest3: { title: string; url: string; publishedAt: string }[];
  error?: string;
}

/** The fetch boundary the adapters use (worker/enrich.ts). We import only the
 * helpers we need; `fetchWithSafeRedirects` needs a Workers runtime, so the
 * script does the same redirect walk with plain `fetch` and asserts the same
 * limits, keeping this a read-only probe with no Worker dependency. */
const MAX_REDIRECTS = 3;

async function probe(
  id: string,
  url: string,
  matchSince: (publishedAt: number) => boolean
): Promise<ProbeResult> {
  const row = SOURCE_REGISTRY.find((s) => s.id === id);
  const config = (row?.config ?? {}) as Record<string, unknown>;
  const base: ProbeResult = {
    id,
    name: row?.name ?? id,
    type: row?.type ?? "rss",
    url,
    status: 0,
    ok: false,
    finalUrl: url,
    contentType: "",
    bytes: 0,
    rawItems: 0,
    inWindow: 0,
    items: 0,
    newest: "",
    oldest: "",
    usable: 0,
    skipped: [],
    gate: { keywordFilter: null, maxItems: null },
    first3: [],
    newest3: [],
  };
  if (!/^https:\/\//i.test(url)) {
    base.error = "not an https URL";
    return base;
  }

  let current = url;
  let res: Response | null = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
          "User-Agent": "aidr-source-verifier/1.0 (+https://aidr.today)",
        },
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
    }
  } catch (error) {
    base.error = `fetch failed: ${String(error).slice(0, 200)}`;
    return base;
  }
  if (!res) {
    base.error = "no response";
    return base;
  }

  base.status = res.status;
  base.finalUrl = current;
  base.contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    base.error = `HTTP ${res.status}`;
    return base;
  }
  if (/\bhtml\b/i.test(base.contentType)) {
    base.error = `content-type is HTML, not a feed: ${base.contentType}`;
    return base;
  }

  const xml = await res.text();
  base.bytes = xml.length;
  const parsed = parseRssItems(xml);
  base.rawItems = parsed.length;

  // Two different questions, kept separate because conflating them is how a
  // healthy-but-quiet feed gets reported as broken:
  //
  //   1. Is the feed VALID? Needs >=1 item with a title, an absolute URL, and
  //      a parseable date — regardless of when it was published. This is what
  //      "verified live" means.
  //   2. Would this run DELIVER? How many items survive the since-window and
  //      the flood gate, i.e. exactly what the Worker would fetch right now.
  //
  // A source can answer (1) yes and (2) zero and still be perfectly healthy:
  // arXiv accepts no weekend submissions, so across a weekend its newest
  // `submittedDate` is ~54 hours old and every run legitimately returns zero.
  const usable = parsed.filter(
    (item) =>
      item.title.trim().length > 0 &&
      /^https?:\/\//i.test(item.url) &&
      Number.isFinite(item.publishedAt)
  );
  base.usable = usable.length;
  base.newest = usable.length
    ? new Date(Math.max(...usable.map((i) => i.publishedAt))).toISOString()
    : "";
  base.oldest = usable.length
    ? new Date(Math.min(...usable.map((i) => i.publishedAt))).toISOString()
    : "";

  const inWindow = parsed.filter((item) => matchSince(item.publishedAt));
  const kept = floodGate(inWindow, config);
  base.inWindow = inWindow.length;
  base.items = kept.length;
  base.skipped = [];
  if (inWindow.length > 0 && kept.length === 0) {
    base.skipped.push(
      "all in-window items removed by the flood gate (keywordFilter / maxItems)"
    );
  }
  if (inWindow.length === 0 && usable.length > 0) {
    base.skipped.push(
      `feed is valid but nothing in the ${Math.round(
        SINCE_WINDOW_SEC / 3600
      )}h ingest window (newest item is ${base.newest})`
    );
  }
  base.gate = {
    keywordFilter: (config.keywordFilter as string) ?? null,
    maxItems: (config.maxItems as number) ?? null,
  };
  // Snapshot the NEWEST items the gate would actually return, so the evidence
  // shows what the Worker sees rather than what the raw feed contains.
  base.first3 = kept.slice(0, 3).map((item) => ({
    title: item.title,
    url: item.url,
    publishedAt: new Date(item.publishedAt).toISOString(),
  }));
  // And the newest usable items anywhere in the feed, so a source that is
  // valid but legitimately quiet right now (arXiv across a weekend) still
  // ships parseable evidence instead of an empty snapshot.
  base.newest3 = [...usable]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 3)
    .map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: new Date(item.publishedAt).toISOString(),
    }));
  base.ok = usable.length > 0;
  if (!base.ok) {
    base.error =
      "0 usable items in the whole feed (need >=1 with title + absolute URL + date)";
  }
  return base;
}

/** The production flood gate, verbatim: same named keyword filter, same
 *  newest-first cap, same order. Re-exported through a named helper so the
 *  probe's intent is readable at the call site. */
function floodGate(
  items: ReturnType<typeof parseRssItems>,
  config: Record<string, unknown>
) {
  return applyFloodGate(items, config);
}

function feedUrl(id: string): string | null {
  const row = SOURCE_REGISTRY.find((s) => s.id === id);
  if (!row) return null;
  const config = row.config as { feed?: unknown };
  return typeof config.feed === "string" ? config.feed : null;
}

/** The pipeline's own 26h overlap window (worker/workflow.ts SINCE_WINDOW_SEC). */
const SINCE_WINDOW_SEC = 26 * 60 * 60;
const matchSince = (publishedAt: number) =>
  publishedAt >= (Date.now() / 1000 - SINCE_WINDOW_SEC) * 1000;

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const ids = args.filter((a) => !a.startsWith("--"));
  const targets = ids.length
    ? ids
    : SOURCE_REGISTRY.filter((s) => s.type === "rss").map((s) => s.id);

  const results: ProbeResult[] = [];
  for (const id of targets) {
    const url = feedUrl(id);
    if (!url) {
      results.push({
        id,
        name: id,
        type: "unknown",
        url: "",
        status: 0,
        ok: false,
        finalUrl: "",
        contentType: "",
        bytes: 0,
        rawItems: 0,
        inWindow: 0,
        items: 0,
        newest: "",
        oldest: "",
        usable: 0,
        skipped: ["no feed URL in registry config"],
        gate: { keywordFilter: null, maxItems: null },
        first3: [],
        newest3: [],
        error: "no feed URL in registry config",
      });
      continue;
    }
    process.stderr.write(`verifying ${id} … `);
    const result = await probe(id, url, matchSince);
    process.stderr.write(
      result.ok
        ? `OK ${result.status} ${result.contentType} ${result.items} items this run / ${result.usable} usable in feed\n`
        : `FAIL ${result.status} ${result.error}\n`
    );
    results.push(result);
    // arXiv asks callers to leave >=3s between API requests. The adapter
    // enforces this in production (minRequestIntervalMs); the probe has to do
    // the same or it would get a 406 and report a false failure.
    const interval = (
      SOURCE_REGISTRY.find((s) => s.id === id)?.config as {
        minRequestIntervalMs?: number;
      }
    )?.minRequestIntervalMs;
    if (interval) {
      await new Promise((resolve) => setTimeout(resolve, interval + 500));
    }
  }

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(`\n### ${r.id} — ${r.name} [${r.type}]`);
      console.log(`  url         ${r.url}`);
      console.log(
        `  status      ${r.status} ${r.contentType} (${r.bytes} bytes)`
      );
      if (r.finalUrl && r.finalUrl !== r.url) {
        console.log(`  redirected  ${r.finalUrl}`);
      }
      console.log(
        `  parsed      ${r.rawItems} items, ${r.usable} usable (title + absolute URL + date)`
      );
      console.log(
        `  this run    ${r.items} after window+gate (${r.inWindow} in the 26h window)`
      );
      const gate: string[] = [];
      if (r.gate.keywordFilter)
        gate.push(`keywordFilter=${r.gate.keywordFilter}`);
      if (r.gate.maxItems !== null) gate.push(`maxItems=${r.gate.maxItems}`);
      if (gate.length) console.log(`  gate        ${gate.join(", ")}`);
      console.log(
        `  newest      ${r.newest || "—"}   oldest ${r.oldest || "—"}`
      );
      if (r.skipped.length)
        console.log(`  note        ${r.skipped.join("; ")}`);
      if (r.error) console.log(`  ERROR       ${r.error}`);
      const shown = r.first3.length > 0 ? r.first3 : r.newest3;
      console.log(
        r.first3.length > 0
          ? "  first 3 the Worker would return this run:"
          : "  newest 3 in the feed (none inside the 26h window right now):"
      );
      for (const item of shown) {
        console.log(`    - ${item.publishedAt}  ${item.title}`);
        console.log(`      ${item.url}`);
      }
      console.log(`  verdict     ${r.ok ? "PASS" : "FAIL"}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  const quiet = results.filter((r) => r.ok && r.items === 0);
  console.log(
    `\n${results.length - failed.length}/${results.length} sources verified live.`
  );
  if (quiet.length) {
    console.log(
      `${quiet.length} valid feed(s) had nothing in the 26h window right now ` +
        `(${quiet.map((q) => q.id).join(", ")}) — expected for a source with a ` +
        `weekend publication freeze; the stale threshold accounts for it.`
    );
  }
  if (failed.length) {
    console.log(
      `FAILED: ${failed.map((f) => `${f.id} (${f.error ?? "no usable items"})`).join(", ")}`
    );
    process.exit(1);
  }
}

await main();
