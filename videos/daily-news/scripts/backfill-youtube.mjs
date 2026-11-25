#!/usr/bin/env node
// YouTube-only backfill of the daily videos the daily run never posted (issues #962, #635).
// Reads the live day pages (`/date/<date>.md`, the same record the day video watchdog checks), picks the oldest
// missing YouTube cuts (en 16:9 "youtube", en 9:16 "short", Vietnamese-subtitle "visub"), re-renders each one from
// an edition rebuilt out of the day page, and runs publish.mjs `--steps render,gate,upload,attach --uploader api`:
// the daily run's own upload and day page record, so the day page and the watchdog see the id. It never runs the
// facebook or telegram steps and never touches the Page or a channel.
// Dry run is the default: it prints the plan (and the commands) and changes nothing. --live uploads, in public.
// Quota: the Data API gives 10,000 units a day, an upload costs 1,600 (+ thumbnail and playlist), so a day holds at
// most 5 uploads, and the daily run needs its own 3 (--reserve). Pace with --limit; it never exceeds the budget.
// Usage: node scripts/backfill-youtube.mjs [--live] [--limit 4] [--date YYYY-MM-DD] [--days 30] [--reserve 3]
//        [--privacy private|unlisted|public]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { vnToday } from "./auto-script.mjs";
import { downloadImages, UA } from "./media.mjs";
import { dayPageIds } from "./status.mjs";

const ROOT = resolve(import.meta.dirname, "..");

export const QUOTA_UNITS_PER_DAY = 10_000;
/** videos.insert 1,600 + thumbnails.set 50 + playlistItems.insert 50, rounded up for a Short too. */
export const UNITS_PER_UPLOAD = 1700;
/** Uploads the daily run makes each day (en 16:9, en Short, visub), on the same quota. */
export const DAILY_RUN_UPLOADS = 3;
export const MAX_UPLOADS_PER_DAY = Math.floor(
  QUOTA_UNITS_PER_DAY / UNITS_PER_UPLOAD
);
export const DEFAULT_LIMIT = 4;
export const MIN_STORIES = 3;

/** Uploads this run may make: the ask, capped by what the day's quota holds after the daily run's share. */
export function uploadBudget({
  limit = DEFAULT_LIMIT,
  reserve = DAILY_RUN_UPLOADS,
} = {}) {
  const room = Math.floor(
    (QUOTA_UNITS_PER_DAY - reserve * UNITS_PER_UPLOAD) / UNITS_PER_UPLOAD
  );
  return Math.max(0, Math.min(limit, MAX_UPLOADS_PER_DAY, room));
}

/** The cuts of a date with no YouTube id, from its live day pages ({ en, vi }: dayPageIds answers). A 404 page is
 *  `{}` and an existing one has the keys (maybe undefined), so no `16x9` key means no day page: nothing to do. */
export function missingCuts(date, pages) {
  if (!("16x9" in (pages.en ?? {}))) return [];
  const cuts = [];
  if (!pages.en["16x9"])
    cuts.push({ date, cut: "youtube", lang: "en", fmt: "16x9" });
  if (!pages.en["9x16"])
    cuts.push({ date, cut: "short", lang: "en", fmt: "9x16" });
  if (!pages.vi?.["16x9"])
    cuts.push({ date, cut: "visub", lang: "visub", fmt: "16x9" });
  return cuts;
}

/** The oldest `budget` missing cuts, grouped per date (a date may be taken in part). `days` is
 *  [{ date, cuts }]; `done` holds "date:cut" keys finished already (STATUS.json), never planned again. */
export function pickWork(days, budget, done = new Set()) {
  const plan = [];
  let left = budget;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const cuts = day.cuts
      .filter((c) => !done.has(`${c.date}:${c.cut}`))
      .slice(0, left);
    if (!cuts.length) continue;
    plan.push({ date: day.date, cuts });
    left -= cuts.length;
    if (left <= 0) break;
  }
  return plan;
}

export const shiftDate = (date, days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5)
    .toISOString()
    .slice(0, 10);

/** Dates to scan, newest first: the `days` before `today` (today is the daily run's). */
export const scanDates = (today, days) =>
  Array.from({ length: days }, (_, i) => shiftDate(today, -(i + 1)));

/** The commands one date needs, in order. English first: visub reuses its voice and timing. AIDR_FORMATS keeps a
 *  run to the formats it needs. No facebook, telegram or check step ever appears here. */
export function commandsFor(
  date,
  cuts,
  { live = false, privacy = "public" } = {}
) {
  const fmts = cuts.filter((c) => c.lang === "en").map((c) => c.fmt);
  const visub = cuts.some((c) => c.lang === "visub");
  const publish = (lang, env) => ({
    script: "publish.mjs",
    args: [
      date,
      "--lang",
      lang,
      "--steps",
      "render,gate,upload,attach",
      "--uploader",
      "api",
      ...(privacy === "public" ? [] : ["--privacy", privacy]),
    ],
    env,
  });
  return [
    { script: "auto-script.mjs", args: ["--date", date] },
    ...(fmts.length
      ? [publish("en", { AIDR_FORMATS: fmts.join(",") })]
      : [{ script: "daily.mjs", args: [date], env: { AIDR_FORMATS: "16x9" } }]),
    ...(visub ? [publish("visub", { AIDR_FORMATS: "16x9" })] : []),
  ].map((c) => ({ ...c, live }));
}

const unescapeMd = (s) => s.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1");

/** The "## AI;DR" bullets of a day page: { text, id } where id is the 8-character story id of its link. A bullet
 *  with no link (its story is not in that day's archive) has id null and cannot be resolved. */
export function parseBullets(md) {
  const section =
    md.match(/^## AI;DR\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ?? "";
  return section
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const m = l
        .slice(2)
        .match(
          /^(.*?)(?: \(\[(?:story|tin)\]\(https:\/\/aidr\.today\/([0-9a-f]{8})[^)]*\)\))?$/
        );
      return { text: unescapeMd(m[1]).trim(), id: m[2] ?? null };
    });
}

/** edition.json stories from the day pages: the linked bullets only, as the bullet text (English, and Vietnamese
 *  matched by story id), the story's title, category and source link, and its image urls (`story` is the
 *  /api/story answer). Throws under MIN_STORIES: the template needs a real edition. */
export async function buildStories({ enMd, viMd, count, story }) {
  const vi = new Map(parseBullets(viMd).map((b) => [b.id, b.text]));
  const linked = parseBullets(enMd).filter((b) => b.id);
  if (linked.length < MIN_STORIES)
    throw new Error(
      `only ${linked.length} bullet(s) link a story on the day page (need ${MIN_STORIES}); not backfilling this date`
    );
  const stories = [];
  for (const [i, b] of linked.slice(0, count).entries()) {
    const s = await story(b.id);
    stories.push({
      rank: i + 1,
      text: b.text,
      text_vi: vi.get(b.id) ?? null,
      category: s.category ?? null,
      title: s.title ?? null,
      title_vi: s.title_vi ?? null,
      url: s.url ?? null,
      source: s.url ? new URL(s.url).hostname.replace(/^www\./, "") : null,
      permalink: `https://aidr.today/${b.id}`,
      urls: [
        s.image_url,
        ...(s.media_manifest?.assets ?? [])
          .filter((a) => a.type === "image")
          .map((a) => a.url),
      ].filter(Boolean),
    });
  }
  return stories;
}

const getText = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
};

/** Writes editions/<date>/edition.json from the live day pages (the public API only serves today). An existing
 *  edition.json (one of the committed ones) is kept as it is. */
async function writeEdition(date) {
  const dir = join(ROOT, "editions", date);
  const file = join(dir, "edition.json");
  if (existsSync(file)) return;
  const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  const page = (lang) =>
    getText(`https://aidr.today/date/${date}.md?lang=${lang}`);
  const stories = await buildStories({
    enMd: await page("en"),
    viMd: await page("vi"),
    count: config.count,
    story: async (id) =>
      JSON.parse(await getText(`https://aidr.today/api/story/${id}`)),
  });
  mkdirSync(join(dir, "assets"), { recursive: true });
  for (const s of stories) {
    s.images = await downloadImages(dir, s.urls, `s${s.rank}`);
    delete s.urls;
  }
  writeFileSync(
    file,
    `${JSON.stringify({ date, fetchedAt: new Date().toISOString(), backfill: true, stories }, null, 2)}\n`
  );
  console.log(`  edition.json from the day page: ${stories.length} stories`);
}

/** What stops the whole run, not just one date: the daily quota used up, or a rejected OAuth token/broker. */
export const isQuotaError = (text) =>
  /quotaExceeded|exceeded your quota|dailyLimitExceeded/i.test(text);
export const isAuthError = (text) =>
  /invalid_grant|invalid_client|unauthorized_client|invalid credentials|\b401\b|token (?:has been )?(?:expired|revoked)|broker.*(?:401|403|rejected)/i.test(
    text
  );

function runScript({ script, args, env }) {
  console.log(
    `$ ${
      env
        ? `${Object.entries(env)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")} `
        : ""
    }node scripts/${script} ${args.join(" ")}`
  );
  const r = spawnSync(
    process.execPath,
    [join(ROOT, "scripts", script), ...args],
    {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
      maxBuffer: 64 << 20,
    }
  );
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return { ok: r.status === 0, text: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

const table = (plan) =>
  plan
    .flatMap((p) => p.cuts)
    .map((c) => `  ${c.date}  ${c.cut.padEnd(7)} ${c.lang.padEnd(5)} ${c.fmt}`)
    .join("\n");

async function scan(dates) {
  const days = [];
  for (const date of dates) {
    const pages = {
      en: await dayPageIds(date, "en"),
      vi: await dayPageIds(date, "vi"),
    };
    const cuts = missingCuts(date, pages);
    if (cuts.length) days.push({ date, cuts });
  }
  return days;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const num = (n, dflt) => {
    const v = flag(n) ?? dflt;
    if (!/^\d+$/.test(String(v))) throw new Error(`${n} ${v}: a whole number`);
    return Number(v);
  };
  const live = argv.includes("--live");
  const only = flag("--date");
  if (only && !/^\d{4}-\d{2}-\d{2}$/.test(only))
    throw new Error(`--date ${only}: YYYY-MM-DD`);
  const privacy = flag("--privacy") ?? "public";
  if (!["private", "unlisted", "public"].includes(privacy))
    throw new Error(`--privacy ${privacy}: private | unlisted | public`);
  const today = vnToday();
  if (only && only >= today)
    throw new Error(`--date ${only}: today and later belong to the daily run`);
  const budget = uploadBudget({
    limit: num("--limit", DEFAULT_LIMIT),
    reserve: num("--reserve", DAILY_RUN_UPLOADS),
  });
  const days = await scan(only ? [only] : scanDates(today, num("--days", 30)));
  const plan = pickWork(days, budget);
  const total = plan.reduce((n, p) => n + p.cuts.length, 0);
  console.log(
    `${live ? "LIVE" : "DRY RUN"}: ${days.reduce((n, d) => n + d.cuts.length, 0)} cut(s) missing on ${days.length} date(s); budget ${budget} upload(s) (~${total * UNITS_PER_UPLOAD} of ${QUOTA_UNITS_PER_DAY} units)\n${table(plan) || "  nothing to do"}`
  );
  if (!total) return;
  if (!live) {
    for (const p of plan)
      for (const c of commandsFor(p.date, p.cuts, { privacy }))
        console.log(
          `  ${p.date}: node scripts/${c.script} ${c.args.join(" ")}${
            c.env
              ? `  [${Object.entries(c.env)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" ")}]`
              : ""
          }`
        );
    console.log(
      "\nDry run: nothing rendered or uploaded. Add --live to upload."
    );
    return;
  }
  const hasBroker =
    process.env.YOUTUBE_BROKER_URL && process.env.YOUTUBE_BROKER_SECRET;
  const hasOauth =
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN;
  if (!hasBroker && !hasOauth)
    throw new Error(
      "no YOUTUBE_BROKER_URL/SECRET and no YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN: nothing to upload with"
    );
  const failed = [];
  let stop = null;
  for (const p of plan) {
    if (stop) break;
    console.log(`\n== ${p.date}: ${p.cuts.map((c) => c.cut).join(", ")}`);
    try {
      await writeEdition(p.date);
    } catch (error) {
      failed.push(`${p.date}: ${error.message}`);
      continue;
    }
    for (const c of commandsFor(p.date, p.cuts, { live, privacy })) {
      const r = runScript(c);
      if (r.ok) continue;
      failed.push(`${p.date}: ${c.script} failed`);
      if (isQuotaError(r.text))
        stop =
          "the YouTube daily quota is used up; stopping, rerun after it resets (midnight Pacific)";
      else if (isAuthError(r.text))
        stop =
          'YouTube rejected the credentials; stopping (README: "Backfill YouTube")';
      break;
    }
  }
  const after = await scan(plan.map((p) => p.date));
  const still = new Set(
    after.flatMap((d) => d.cuts.map((c) => `${c.date}:${c.cut}`))
  );
  console.log("\nResult:");
  for (const c of plan.flatMap((p) => p.cuts))
    console.log(
      `  ${c.date}  ${c.cut.padEnd(7)} ${still.has(`${c.date}:${c.cut}`) ? "still missing" : "on the day page"}`
    );
  if (stop) console.error(stop);
  if (failed.length) {
    console.error(`\nFailed:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
}

if (resolve(process.argv[1] ?? "") === import.meta.filename) await main();
