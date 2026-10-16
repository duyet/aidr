// Pulls a real 30-hour window from production D1 into snapshot.json, which
// build.mjs draws. Rank inputs come from the Worker's own rankSignals, so
// the figure's scores use the same points, comments and source families.
// Run: pnpm --filter @aidr/web exec tsx scripts/how-it-works/snapshot.ts
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rankScore, rankSignals } from "../../worker/ranking";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOURS = 30;

type Row = Record<string, string | number | null>;
function query(sql: string): Row[] {
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "aidr",
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    {
      cwd: join(HERE, "../.."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }
  );
  return JSON.parse(out)[0].results;
}

const end = Math.floor(Date.now() / 1000 / 1800) * 1800;
const start = end - HOURS * 3600;
const rows = query(`
  SELECT i.id, i.source_id, s.name AS source, i.title, i.url, i.published_at, i.fetched_at,
         i.points, i.comments, i.llm_importance AS importance, i.llm_quality AS quality, i.category,
         i.status, i.duplicate_of, i.rank_score,
         (SELECT COALESCE(SUM(v.value), 0) FROM item_votes v WHERE v.item_id = i.id) AS votes
  FROM items i LEFT JOIN sources s ON s.id = i.source_id
  WHERE (i.fetched_at BETWEEN ${start} AND ${end} OR i.published_at BETWEEN ${start - 86400} AND ${end})
    AND i.fetched_at <= ${end} AND i.status IN ('published', 'merged', 'rejected')
  ORDER BY i.fetched_at`);

// A published story's cluster is itself plus every item merged into it.
const members = new Map<string, Row[]>();
for (const r of rows) {
  const key = String(r.status === "merged" ? r.duplicate_of : r.id);
  members.set(key, [...(members.get(key) ?? []), r]);
}

const items = rows.map((r) => {
  const base = {
    ref: String(r.id),
    source: r.source ?? r.source_id,
    title: r.title,
    status: r.status,
    fetched: (Number(r.fetched_at) - start) / 3600,
  };
  if (r.status !== "published") return base;
  const signals = rankSignals(
    (members.get(String(r.id)) ?? [r]).map((m) => ({
      sourceId: String(m.source_id),
      points: Number(m.points ?? 0),
      comments: Number(m.comments ?? 0),
      url: String(m.url ?? ""),
    }))
  );
  const input = {
    importance: Number(r.importance ?? 0),
    quality: Number(r.quality ?? 0),
    voteNet: Number(r.votes ?? 0),
    ...signals,
    category: r.category == null ? null : String(r.category),
  };
  return {
    ...base,
    published: (Number(r.published_at) - start) / 3600,
    ...input,
    // Score at the end of the window, to cross-check the figure's port.
    scoreAtEnd: rankScore({
      ...input,
      publishedAt: Number(r.published_at) * 1000,
      now: end * 1000,
    }),
  };
});

const snap = query(
  "SELECT date, bullets_en, bullets_vi, created_at FROM tldr_snapshots ORDER BY date DESC LIMIT 1"
)[0];
const sources = Number(
  query("SELECT COUNT(*) AS n FROM sources WHERE enabled = 1")[0].n
);
const bullets = (raw: unknown) =>
  (JSON.parse(String(raw)) as { text: string; item_ids?: string[] }[]).map(
    (b) => ({ text: b.text, ids: b.item_ids ?? [] })
  );

writeFileSync(
  join(HERE, "snapshot.json"),
  `${JSON.stringify({ start, end, sources, items, tldr: { date: snap.date, created: Number(snap.created_at), en: bullets(snap.bullets_en), vi: bullets(snap.bullets_vi) } }, null, 1)}\n`
);
console.log(
  `snapshot: ${items.length} items, ${sources} sources, tldr ${snap.date}`
);
