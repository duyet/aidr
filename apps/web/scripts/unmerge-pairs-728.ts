#!/usr/bin/env tsx
/**
 * Builds the unmerge pairs file for #733 from the #728 hand labels, reading
 * production D1 with SELECTs only (`wranglerSelect`).
 *
 * `fixtures/unmerge-728/labels.txt` holds one canonical id prefix per line
 * with its label: W (wrong merge), L (correct), A (unclear). The labeller saw
 * the low-overlap pairs of each canonical: merged items whose title is not a
 * near-duplicate and shares at most one significant token with the
 * canonical's, and whose image is in the canonical's manifest. Only W
 * canonicals are used. Each output pair is one of:
 * - `labelled`: a pair the labeller saw under a W canonical;
 * - `twin`: the huggingnews/marketbrief copy of a labelled pair (same slug
 *   hash), which must come back with it or the story stays split.
 * `EXCLUDED` strikes labelled pairs judged correct on a second look. Other
 * low-overlap members of W canonicals go to `review`, which nothing applies.
 *
 * Usage: pnpm --filter @aidr/web exec tsx scripts/unmerge-pairs-728.ts > pairs.json
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTitleNearDuplicate, significantTitleTokens } from "../worker/dedupe";
import { wranglerSelect, wranglerSelectTotals } from "./cf-d1";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Labelled pairs that are correct merges, by merged id prefix. */
const EXCLUDED: Record<string, string> = {
  "4d732c5c":
    "270d2009 is OpenAI's 'Sharing AI progress in mathematics'; 'OpenAI Releases 722 Math Proofs' is the same story. Only the Allen AI pair under it is wrong.",
  dc6ed771: "marketbrief twin of 4d732c5c, same story as 270d2009.",
};

const AGGREGATOR_SLUG =
  /^https?:\/\/(?:www\.)?(?:huggingnews\.com|marketbrief\.now)\/.*-([0-9a-f]{8})\/?$/i;

interface Row {
  id: string;
  duplicate_of: string | null;
  source_id: string;
  url: string;
  title: string;
  image_url: string | null;
  media_manifest: string | null;
}

const hex = (prefix: string) => {
  if (!/^[0-9a-f]{8}$/.test(prefix)) throw new Error(`bad id prefix ${prefix}`);
  return `'${prefix}'`;
};

function sharedTokens(a: string, b: string): number {
  const tb = significantTitleTokens(b);
  return [...significantTitleTokens(a)].filter((t) => tb.has(t)).length;
}

function lowOverlap(canonical: Row, member: Row): boolean {
  return (
    !isTitleNearDuplicate(canonical.title, member.title) &&
    sharedTokens(canonical.title, member.title) <= 1
  );
}

const slugHash = (url: string) => AGGREGATOR_SLUG.exec(url)?.[1] ?? null;

function main(): void {
  const labels = readFileSync(
    path.join(here, "fixtures/unmerge-728/labels.txt"),
    "utf8"
  )
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/) as [string, string]);
  const wrong = labels
    .filter(([, label]) => label === "W")
    .map(([prefix]) => prefix);

  const canonicals = wranglerSelect(
    `SELECT id, duplicate_of, source_id, url, title, image_url, media_manifest
     FROM items WHERE status = 'published' AND substr(id, 1, 8) IN (${wrong.map(hex).join(", ")})`
  ) as unknown as Row[];
  for (const prefix of wrong) {
    const found = canonicals.filter((c) => c.id.startsWith(prefix));
    if (found.length !== 1) {
      throw new Error(`label ${prefix} matches ${found.length} published rows`);
    }
  }
  const byId = new Map(canonicals.map((c) => [c.id, c]));
  const members = wranglerSelect(
    `SELECT id, duplicate_of, source_id, url, title, image_url, media_manifest
     FROM items WHERE status = 'merged'
       AND duplicate_of IN (${canonicals.map((c) => `'${c.id}'`).join(", ")})
     ORDER BY duplicate_of, fetched_at, id`
  ) as unknown as Row[];

  const pairs: Record<string, unknown>[] = [];
  const excluded: Record<string, unknown>[] = [];
  const review: Record<string, unknown>[] = [];
  const entry = (c: Row, m: Row, extra: Record<string, unknown>) => ({
    canonicalId: c.id,
    mergedId: m.id,
    ...extra,
    canonical: `[${c.source_id}] ${c.title}`,
    merged: `[${m.source_id}] ${m.title}`,
  });

  const labelled = new Set<string>();
  for (const m of members) {
    const c = byId.get(m.duplicate_of ?? "") as Row;
    const seen =
      lowOverlap(c, m) &&
      m.image_url !== null &&
      (c.media_manifest ?? "").includes(m.image_url);
    if (!seen) continue;
    const reason = EXCLUDED[m.id.slice(0, 8)];
    if (reason) {
      excluded.push(entry(c, m, { reason }));
      continue;
    }
    labelled.add(m.id);
  }
  const usedPrefixes = new Set(
    excluded.map((e) => String(e.mergedId).slice(0, 8))
  );
  for (const prefix of Object.keys(EXCLUDED)) {
    if (!usedPrefixes.has(prefix))
      throw new Error(`EXCLUDED ${prefix} matched no labelled pair`);
  }

  const groupOf = (m: Row) => {
    const hash = slugHash(m.url);
    return hash ? `slug:${hash}` : m.id;
  };
  const labelledGroups = new Set(
    members
      .filter((m) => labelled.has(m.id))
      .map((m) => `${m.duplicate_of}:${groupOf(m)}`)
  );
  for (const m of members) {
    const c = byId.get(m.duplicate_of ?? "") as Row;
    const group = groupOf(m);
    if (labelled.has(m.id)) {
      pairs.push(entry(c, m, { group, why: "labelled" }));
    } else if (labelledGroups.has(`${c.id}:${group}`)) {
      pairs.push(entry(c, m, { group, why: "twin" }));
    } else if (lowOverlap(c, m) && !excluded.some((e) => e.mergedId === m.id)) {
      review.push(entry(c, m, { why: "low title overlap, not hand-checked" }));
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        source:
          "#728 hand labels (fixtures/unmerge-728/labels.txt), W canonicals only",
        canonicals: new Set(pairs.map((p) => p.canonicalId)).size,
        pairs,
        excluded,
        review,
        readOnly: wranglerSelectTotals,
      },
      null,
      2
    )}\n`
  );
  const counts = { labelled: 0, twin: 0 };
  for (const p of pairs) counts[p.why as keyof typeof counts]++;
  console.error(
    `pairs ${pairs.length} (${JSON.stringify(counts)}), excluded ${excluded.length}, review ${review.length}; ${wranglerSelectTotals.queries} read-only queries`
  );
}

main();
