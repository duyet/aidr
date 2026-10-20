#!/usr/bin/env node
// The daily runner: render → upload → attach → telegram, idempotent per cut.
// State lives in editions/<date>/STATUS.json (ignored): one row per cut. A step skips cuts it already
// finished (YouTube cannot replace a file, Telegram cannot unpost), so rerunning is always safe.
// The runner never writes scripts: script.json (and script.vi.json) must be written first.
// --steps check needs no script: it exits 3 when every requested cut is already on the live day page
// (run it before writing scripts; render also skips published cuts).
// gate and facebook run only when listed in --steps: gate checks every render (video + audio streams, a real
// duration) and the post/script text (no engagement bait, no TODO), and the Reels copy of the EN 9:16 cut
// against the Reels spec; facebook posts that copy to the Page as a Reel (needs --prod: there is no staging Page).
// --render-published renders cuts that are already on the day page (for the Reel on a fresh CI runner).
// --lang visub is the English cut with Vietnamese subtitles (lang.mjs, visub.mjs): render (after the en cut on the same
// machine), gate, upload (Vietnamese title and description, English audio), attach (to the Vietnamese day page) and
// telegram (the Vietnamese channel; the YouTube button is its own video, else the English one). The Vietnamese page
// takes one video, so the Vietnamese-voice cut wins: visub is not uploaded or attached once that cut has a video.
// Telegram: only a --prod post to the real channel marks a cut done (`telegram`); staging and --chat sends are kept
// as `telegramTest`, so the staging check never blocks the --prod post.
// Usage: node scripts/publish.mjs <date> [--lang en,vi,visub] [--steps check|render,gate,upload,attach,facebook,telegram]
//        [--no-voice] [--chat <telegram chat id>] [--prod] [--telegram-fmt 16x9|9x16] [--telegram-mode video|card]
//        [--dry-run] [--uploader chrome|api] [--privacy private|unlisted|public]
// Weekly editions (week-YYYY-Www): only `--steps render` (and --dry-run); the other steps are planned, not wired.
// --uploader api (YouTube Data API, headless) is the default when YOUTUBE_REFRESH_TOKEN is set, else chrome (owner's Chrome).
// --privacy applies to the api uploader only (default public).
// Telegram uploads the video file itself (sendVideo, a <50 MB copy next to the render; needs only the render, the YouTube button
// appears when the cut has an id). It goes to $TELEGRAM_STAGING_CHAT_ID (from .env.local) unless --chat is given; --prod posts to
// the real channels. --telegram-mode card keeps the old Worker path (YouTube thumbnail card; needs the attached ids).
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  findReel,
  makeReelCopy,
  postReel,
  reelCaption,
  reelConfig,
  reelCopyPath,
  reelEncodeArgs,
  reelProblems,
} from "./facebook-reel.mjs";
import { gateVideo, lintText, probeStreams, scriptTexts } from "./gate.mjs";
import { cutFor, isWeekly, LANGS } from "./lang.mjs";
import {
  addRows,
  attachTodo,
  dayPageIds,
  dayVideoArgs,
  dayVideoPostedArgs,
  needsRender,
  parseUpload,
  seedIds,
  telegramTodo,
  uploadArgs,
  uploadTodo,
  viPageCut,
} from "./status.mjs";
import {
  chatFor,
  envVar,
  makeTelegramCopy,
  makeThumbnail,
  sendVideo,
  telegramPost,
  tgCopyPath,
  tgEncodeArgs,
  youtubeIdFor,
} from "./telegram-video.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REPO = resolve(ROOT, "../..");
const STEPS = ["render", "gate", "upload", "attach", "facebook", "telegram"];
// Public steps that have no staging target run only when asked for by name.
const DEFAULT_STEPS = ["render", "upload", "attach", "telegram"];
const argv = process.argv.slice(2);
const date = argv[0];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") && !isWeekly(date ?? ""))
  throw new Error(
    "usage: publish.mjs <date | week-YYYY-Www> [--lang en,vi,visub] [--steps render,gate,upload,attach,facebook,telegram] [--no-voice] [--chat <id>] [--prod] [--telegram-fmt 16x9|9x16] [--telegram-mode video|card] [--dry-run] [--uploader chrome|api] [--privacy private|unlisted|public]"
  );
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const list = (n, all) => (flag(n) ? flag(n).split(",").filter(Boolean) : all);
// visub runs only when asked for; the English cut always goes before it (visub reuses its build).
const langs = list("--lang", ["en", "vi"]).sort(
  (a, b) => LANGS.indexOf(a) - LANGS.indexOf(b)
);
const steps = list("--steps", DEFAULT_STEPS);
const uploader =
  flag("--uploader") ?? (process.env.YOUTUBE_REFRESH_TOKEN ? "api" : "chrome");
const privacy = flag("--privacy") ?? "public";
const dry = argv.includes("--dry-run");
const prod = argv.includes("--prod");
const noVoice = argv.includes("--no-voice");
// Render cuts already on the day page too (the scheduled Reel needs the 9:16 file on a fresh runner).
const renderPublished = argv.includes("--render-published");
const tgFmt = flag("--telegram-fmt") ?? "16x9";
const tgMode = flag("--telegram-mode") ?? "video";
if (!["16x9", "9x16"].includes(tgFmt))
  throw new Error(`--telegram-fmt ${tgFmt}: 16x9 | 9x16`);
if (!["video", "card"].includes(tgMode))
  throw new Error(`--telegram-mode ${tgMode}: video | card`);
for (const l of langs)
  if (!LANGS.includes(l)) throw new Error(`--lang ${l}: ${LANGS.join(" | ")}`);
if (!["chrome", "api"].includes(uploader))
  throw new Error(`--uploader ${uploader}: chrome | api`);
if (!["private", "unlisted", "public"].includes(privacy))
  throw new Error(`--privacy ${privacy}: private | unlisted | public`);
const checkOnly = steps.length === 1 && steps[0] === "check";
if (!checkOnly)
  for (const s of steps)
    if (!STEPS.includes(s))
      throw new Error(`--steps ${s}: check | ${STEPS.join(" | ")}`);

// Weekly editions (`week-2026-W41`): only the render step is wired. Upload, attach and telegram have no weekly
// page or YouTube/Telegram flow yet, so refuse them before anything runs.
const weekly = isWeekly(date);
if (
  weekly &&
  (checkOnly || steps.some((s) => s !== "render") || !argv.includes("--steps"))
) {
  console.error(
    `✗ ${date}: ${checkOnly ? "--steps check" : "upload, attach and telegram"} are not wired for weekly editions yet (planned). Use --steps render (and --dry-run).`
  );
  process.exit(1);
}

const dir = join(ROOT, "editions", date);
const statusPath = join(dir, "STATUS.json");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const q = (a) => (/^[\w./:=@,-]+$/.test(a) ? a : JSON.stringify(a));
const show = (cmd, args) => console.log(`$ ${[cmd, ...args].map(q).join(" ")}`);

// Run a command (or print it with --dry-run). Returns stdout; stdio is shown live on stderr. A failure's error
// carries the stdout too (an uploader prints ID= before the steps that can still fail).
function run(cmd, args, opts = {}) {
  show(cmd, args);
  if (dry) return "";
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    maxBuffer: 64 << 20,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0)
    throw Object.assign(new Error(`${cmd} exited ${r.status}`), {
      stdout: r.stdout ?? "",
    });
  return r.stdout;
}

// 0. Precondition: every requested language has a finished script.
const draft = (l) => {
  const file = join(dir, cutFor(l).script);
  if (!existsSync(file)) return `${file} is missing`;
  const bad = readFileSync(file, "utf8")
    .split("\n")
    .filter((s) => s.includes("TODO") || s.includes('"_bullet"'));
  return bad.length
    ? `${file} is still a draft (${bad.length} TODO/_bullet lines)`
    : null;
};
const problems = checkOnly ? [] : langs.map(draft).filter(Boolean);
if (problems.length) {
  console.error(
    `✗ The newsroom writing pass (an agent) is required first; publish.mjs does not write scripts:\n  ${problems.join("\n  ")}\n` +
      "  English: node scripts/new.mjs, then rewrite script.json. Vietnamese: write script.vi.json from text_vi."
  );
  process.exit(1);
}

// State.
const rows = existsSync(statusPath)
  ? JSON.parse(readFileSync(statusPath, "utf8"))
  : [];
const save = () =>
  !dry &&
  !checkOnly &&
  writeFileSync(statusPath, `${JSON.stringify(rows, null, 2)}\n`);
addRows(rows, { date, langs, config, dir });
const mine = rows.filter((r) => langs.includes(r.lang));
const byLang = (l) => mine.filter((r) => r.lang === l);
const probe = (file, ...a) =>
  execFileSync("ffprobe", ["-v", "error", ...a, file], {
    encoding: "utf8",
  }).trim();

// The YouTube title of a language's block in posts.md.
function ytTitle(l) {
  const md = readFileSync(join(dir, "posts.md"), "utf8");
  const block =
    md.match(
      new RegExp(`<!-- posts:${l} -->[\\s\\S]*?<!-- /posts:${l} -->`)
    )?.[0] ?? "";
  return block.match(/\*\*Title\*\*[^\n]*\n\n([^\n]+)/)?.[1]?.trim() ?? null;
}

// First object in a JSON blob (any depth) that has the key.
const find = (v, key) => {
  if (v && typeof v === "object") {
    if (key in v) return v[key];
    for (const x of Object.values(v)) {
      const r = find(x, key);
      if (r !== undefined) return r;
    }
  }
};
const lastJson = (text) => {
  for (const line of text.trim().split("\n").reverse())
    try {
      return JSON.parse(line);
    } catch {}
  return null;
};

const summary = (what, targets) =>
  console.log(
    `\n▶ ${what}: ${targets.length ? targets.join(", ") : "nothing to do"}`
  );

// 0. Check: is the date already published? Cheap, so it runs before any writing or rendering.
if (checkOnly) {
  const left = uploadTodo(rows, langs, await seedFromSite());
  if (!left.length) {
    console.log(
      `✓ ${date}: every cut is already on the day page; nothing to publish`
    );
    process.exit(3);
  }
  console.log(`▶ ${date}: to publish: ${left.map((r) => r.cut).join(", ")}`);
  process.exit(0);
}

// 1. Render. A cut already on the live day page is not rendered again unless --render-published.
if (steps.includes("render")) {
  await seedFromSite();
  const rendered = new Set();
  for (const l of langs) {
    const todo = byLang(l).filter((r) =>
      needsRender(r, { renderPublished, exists: existsSync })
    );
    summary(
      `render ${l}`,
      todo.map((r) => r.cut)
    );
    if (!todo.length) continue;
    if (!dry) {
      for (const r of todo) r.state = "rendering";
      save();
    }
    run(process.execPath, [
      join(ROOT, "scripts/daily.mjs"),
      date,
      ...cutFor(l).args,
      "--render",
      ...(noVoice ? ["--no-voice"] : []),
    ]);
    for (const r of todo) rendered.add(r.cut);
  }
  for (const r of mine) {
    if (dry) continue;
    if (!existsSync(r.path)) continue;
    r.duration = Number(
      Number(
        probe(r.path, "-show_entries", "format=duration", "-of", "csv=p=0")
      ).toFixed(2)
    );
    r.sizeMB = Number((statSync(r.path).size / 1e6).toFixed(1));
    if (!["uploaded", "attached", "posted"].includes(r.state))
      r.state = "rendered";
    // Whether the cut has narration: build.mjs records it in the language's timeline.json.
    const tl = join(dir, cutFor(r.lang).timeline);
    if ((rendered.has(r.cut) || r.voice === undefined) && existsSync(tl))
      r.voice = JSON.parse(readFileSync(tl, "utf8")).voice !== false;
  }
  save();
}

// 1b. Gate (before any upload): every render is a real video with sound, and the text is clean. The EN 9:16 Reels copy is also
// checked against the Reels spec; a Reel-only problem (e.g. over 90 s) is reported here and stops the facebook step.
if (steps.includes("gate")) {
  summary(
    "gate",
    mine.map((r) => r.cut)
  );
  const hard = [];
  for (const l of langs) {
    const file = join(dir, cutFor(l).script);
    for (const [label, text] of scriptTexts(
      JSON.parse(readFileSync(file, "utf8"))
    ))
      hard.push(...lintText(`${cutFor(l).script} ${label}`, text));
  }
  if (langs.includes("en") && existsSync(join(dir, "posts.md")))
    hard.push(
      ...lintText(
        "posts.md facebook",
        reelCaption(readFileSync(join(dir, "posts.md"), "utf8"), date, "en")
      )
    );
  for (const r of mine) {
    if (dry) {
      console.log(`  ffprobe ${r.path}`);
      continue;
    }
    if (!existsSync(r.path)) {
      hard.push(`${r.cut}: not rendered`);
      continue;
    }
    const p = gateVideo(probeStreams(r.path), "any");
    hard.push(...p.map((x) => `${r.cut}: ${x}`));
    if (r.lang === "en" && r.fmt === "9x16" && !p.length) {
      const reel = reelProblems(makeReelCopy(r.path), "-");
      r.reelGate = reel.length ? reel : "ok";
      console.log(
        `  ${r.cut} reel copy: ${reel.length ? `✗ ${reel.join("; ")}` : "✓"}`
      );
    }
  }
  save();
  if (hard.length) throw new Error(`gate failed:\n  ${hard.join("\n  ")}`);
  console.log("✓ gate");
}

// The Vietnamese title translated with the visub captions (visub.mjs), if any.
function subsTitle() {
  const file = join(dir, cutFor("visub").subs.json);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")).title ?? null)
    : null;
}

// A cut's title on the day page and in its Telegram caption.
const titleFor = (l) => (l === "visub" ? subsTitle() : ytTitle(l));

// 2. Upload, serially (owner's Chrome, or the Data API). Stops on the first failure.
// STATUS.json is local, so first take ids already on the live day pages: a date uploaded elsewhere must not get
// a second public copy. The Vietnamese page shows one cut (status.mjs viPageCut), which is returned.
async function seedFromSite() {
  if (weekly) return null; // no weekly day page yet
  const pages = { en: await dayPageIds(date, "en") };
  if (langs.some((l) => cutFor(l).page === "vi"))
    pages.vi = await dayPageIds(date, "vi");
  for (const l of langs) {
    const ids = seedIds(l, pages, rows);
    for (const r of byLang(l)) {
      const id = ids[r.fmt];
      if (!id || r.youtube?.id) continue;
      // One video never serves two cuts.
      if (rows.some((o) => o.lang !== l && o.youtube?.id === id)) continue;
      console.log(
        `  ${r.cut}: already on ${date} day page as ${id}, skipping upload`
      );
      r.youtube = { id, url: `https://youtu.be/${id}`, seeded: true };
      r.attached = true;
      if (!["posted"].includes(r.state)) r.state = "attached";
    }
  }
  if (!dry) save();
  return pages.vi ? viPageCut(pages, rows) : null;
}

const voiceWins = (r) =>
  console.log(
    `  ${r.cut}: the Vietnamese-voice cut is the day's Vietnamese video; not uploading or attaching the subtitled cut`
  );

// The title, languages and description an upload sends (yt-meta.py, as the uploaders read it): the dry-run plan.
function showMeta(args) {
  const at = (f) => args[args.indexOf(f) + 1];
  const meta = at("--meta");
  if (!existsSync(meta))
    return console.log(`  ${meta}: written before the upload`);
  const bin = join(REPO, ".agents/skills/aidr-youtube-upload/bin/yt-meta.py");
  const m = JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        bin,
        meta.endsWith(".json") ? "--json" : "--daily",
        meta,
        "--lang",
        at("--lang"),
        "--kind",
        at("--kind"),
      ],
      { encoding: "utf8" }
    )
  );
  console.log(
    `  title: ${m.title}\n  defaultLanguage: ${at("--lang")} · defaultAudioLanguage: ${at("--audio-lang")}\n  tags: ${m.tags}\n  description:\n${m.desc.replace(/^/gm, "    ")}`
  );
}

if (steps.includes("upload")) {
  const viPage = await seedFromSite();
  const todo = uploadTodo(rows, langs, viPage);
  for (const r of mine.filter(
    (r) => r.lang === "visub" && !r.youtube?.id && !todo.includes(r)
  ))
    voiceWins(r);
  summary(
    uploader === "api"
      ? `upload to YouTube (${privacy}, Data API)`
      : "upload to YouTube (public, owner's Chrome)",
    todo.map((r) => r.cut)
  );
  for (const r of todo) {
    if (!dry && !existsSync(r.path))
      throw new Error(
        `${r.cut}: ${r.path} is not rendered; run --steps render`
      );
    const args = uploadArgs(r, dir);
    const bin = join(
      REPO,
      ".agents/skills/aidr-youtube-upload/bin",
      uploader === "api" ? "yt-upload-api.mjs" : "yt-upload"
    );
    if (uploader === "api") args.push("--privacy", privacy);
    let out = "";
    let failed = null;
    try {
      if (r.lang === "visub")
        run(process.execPath, [
          join(ROOT, "scripts/visub.mjs"),
          date,
          "--youtube",
        ]);
    } catch (e) {
      // Its reason is on stderr, in the log.
      failed = new Error(
        `the Vietnamese YouTube metadata (visub.mjs --youtube) failed: ${e.message}; see the log above`
      );
    }
    try {
      if (!failed) out = run(bin, args);
    } catch (e) {
      out = e.stdout ?? "";
      failed = e;
    }
    if (dry) {
      showMeta(args);
      continue;
    }
    // Record an id even from a failed run: YouTube cannot replace a file, so a rerun must not upload it again.
    const up = parseUpload(out);
    if (up.id) {
      r.youtube = {
        id: up.id,
        url: up.url ?? `https://youtu.be/${up.id}`,
        oembed: up.oembed,
      };
      r.state = "uploaded";
    }
    if (failed || !up.id) {
      const why = up.fail ?? failed?.message ?? "the uploader printed no ID=";
      r.uploadError = { at: new Date().toISOString(), why };
      save();
      throw new Error(
        `${r.cut}: upload failed: ${why}${up.id ? ` (video ${up.id} is on YouTube and recorded; a rerun does not upload it again)` : ""}`
      );
    }
    delete r.uploadError;
    save();
  }
}

// 3. Attach the YouTube ids to the day page, per language (every cut of the language needs its id). visub goes to
// the Vietnamese page with its 16:9 only.
if (steps.includes("attach")) {
  const viPage = await seedFromSite();
  const todo = attachTodo(rows, langs, { viPage, dry });
  for (const r of mine.filter(
    (r) =>
      r.lang === "visub" &&
      r.youtube?.id &&
      !r.attached &&
      !todo.includes("visub")
  ))
    voiceWins(r);
  summary("attach to the day page", todo);
  for (const l of todo) {
    const page = cutFor(l).page;
    if (!dry && byLang(l).some((r) => !r.youtube?.id))
      throw new Error(
        `${l}: every cut (${byLang(l)
          .map((r) => r.fmt)
          .join(", ")}) needs a YouTube id to attach; run --steps upload`
      );
    const out = run(
      "pnpm",
      [
        "--filter",
        "@aidr/web",
        "agent",
        ...dayVideoArgs({ date, lang: l, rows: byLang(l), title: titleFor(l) }),
      ],
      { cwd: REPO }
    );
    // A Worker without per-language day videos ignores `lang` and would write VI ids into the EN columns.
    if (
      !dry &&
      !out.includes(`"lang": "${page}"`) &&
      !out.includes(`"lang":"${page}"`)
    )
      throw new Error(
        `${l}: the day-video response has no lang=${page}; is the per-language Worker (migration 0052) deployed?`
      );
    for (const r of dry ? [] : byLang(l)) {
      r.attached = true;
      if (r.state === "uploaded") r.state = "attached";
    }
    save();
  }
}

// 3b. Facebook Reel: the EN 9:16 cut, once. The Page itself is the record (a Reel whose description has the
// day link is never posted again, even from a fresh CI checkout); STATUS.json keeps the video id so a rerun
// after an unclear answer only polls it.
if (steps.includes("facebook")) {
  const target = mine.find((r) => r.lang === "en" && r.fmt === "9x16");
  if (langs.includes("vi"))
    console.log("  facebook: the Page is English; the vi cut is not posted");
  summary(
    "facebook reel (PRODUCTION Page)",
    target && !target.facebook?.published ? [target.cut] : []
  );
  if (target && !target.facebook?.published) {
    if (!prod && !dry)
      throw new Error(
        "facebook posts to the real Page (there is no staging Page): add --prod"
      );
    const description = reelCaption(
      readFileSync(join(dir, "posts.md"), "utf8"),
      date,
      "en"
    );
    const marker = `aidr.today/date/${date}`;
    if (dry) {
      show(
        process.env.FFMPEG || "ffmpeg",
        reelEncodeArgs(target.path, reelCopyPath(target.path))
      );
      console.log(
        `  gate ${reelCopyPath(target.path)}; skip if a Page Reel mentions ${marker}; POST video_reels start → rupload → finish PUBLISHED\n  description:\n${description.replace(/^/gm, "    ")}`
      );
    } else {
      if (!existsSync(target.path))
        throw new Error(`${target.cut}: not rendered; run --steps render`);
      const copy = makeReelCopy(target.path);
      const problems = reelProblems(copy, description);
      if (problems.length)
        throw new Error(
          `${target.cut}: the Reel gate failed, not posting:\n  ${problems.join("\n  ")}`
        );
      const cfg = reelConfig(envVar);
      const found = target.facebook?.video_id
        ? null
        : await findReel({ ...cfg, marker });
      if (found) {
        console.log(
          `  ${target.cut}: already on the Page as reel ${found.id}; not posting again`
        );
        target.facebook = { id: found.id, published: true, seeded: true };
      } else {
        const out = await postReel({
          ...cfg,
          file: copy,
          description,
          marker,
          resumeVideoId: target.facebook?.video_id,
          onVideoId: (id) => {
            target.facebook = { video_id: id, published: false };
            save();
          },
        });
        target.facebook = {
          id: out.videoId,
          video_id: out.videoId,
          published: true,
          url: `https://www.facebook.com/reel/${out.videoId}`,
        };
      }
      save();
    }
  }
}

// 4. Telegram, once per language: the video file itself (default) or the Worker's YouTube card.
// Chats (telegram-video.mjs chatFor): --chat <id> for every language; else staging; with --prod each language's channel.
// Only a --prod post to the real channel marks the cut done; a staging/--chat send is recorded as telegramTest.
if (steps.includes("telegram")) {
  const override = flag("--chat");
  const staging = envVar("TELEGRAM_STAGING_CHAT_ID");
  if (!prod && !override && !staging && !dry)
    throw new Error(
      "no staging chat: set TELEGRAM_STAGING_CHAT_ID (.env.local), pass --chat <id>, or --prod"
    );
  const real = prod && !override;
  const where = real
    ? "PRODUCTION channels"
    : `chat ${override ?? staging ?? "$TELEGRAM_STAGING_CHAT_ID"}${prod ? "" : " (staging)"}`;
  const fmt = tgMode === "card" ? "16x9" : tgFmt;
  // The card is the Worker's post of a day page's video; visub shares the Vietnamese page, so it has no card.
  const tgLangs =
    tgMode === "card" ? langs.filter((l) => !cutFor(l).subs) : langs;
  const todo = telegramTodo(rows, tgLangs, fmt);
  for (const r of mine.filter(
    (r) =>
      r.lang === "visub" && r.fmt === fmt && !r.telegram && !todo.includes(r)
  ))
    console.log(
      `  ${r.cut}: the Vietnamese-voice cut is already on the channel; not posting the subtitled cut`
    );
  summary(
    `telegram ${tgMode === "card" ? "card" : `video ${fmt}`} → ${where}`,
    todo.map((r) => r.cut)
  );
  const token = envVar("TELEGRAM_BOT_TOKEN");
  if (tgMode === "video" && todo.length && !token && !dry)
    throw new Error("TELEGRAM_BOT_TOKEN is not set (env or .env.local)");
  const record = (target, sent) => {
    if (real) {
      target.telegram = sent;
      target.state = "posted";
    } else target.telegramTest = sent;
    save();
  };
  for (const target of todo) {
    const l = target.lang;
    const chat = chatFor(l, { override, prod, staging });
    if (tgMode === "card") {
      const args = [
        "--filter",
        "@aidr/web",
        "agent",
        "day-video-telegram",
        date,
        "--lang",
        l,
      ];
      if (chat) args.push("--chat", chat);
      const out = run("pnpm", args, { cwd: REPO });
      if (dry) continue;
      const json = lastJson(out);
      const message_id = find(json, "message_id");
      if (message_id === undefined)
        throw new Error(`${l}: no message_id in day-video-telegram output`);
      record(target, {
        chat_id: find(json, "chat_id") ?? chat ?? "prod",
        message_id,
      });
      continue;
    }
    // visub: its own YouTube id, else the English video's (STATUS, else the live day page), and the translated title.
    const youtubeId =
      youtubeIdFor(target, rows) ??
      (l === "visub" ? (await dayPageIds(date, "en"))["16x9"] : undefined);
    const title = titleFor(l);
    const { caption, replyMarkup } = telegramPost({
      date,
      lang: l,
      title,
      youtubeId,
    });
    const copy = tgCopyPath(target.path);
    if (dry) {
      show(
        process.env.FFMPEG || "ffmpeg",
        tgEncodeArgs(target.path, copy, fmt)
      );
      console.log(
        `  sendVideo ${target.cut} → ${chat}: ${caption} ${JSON.stringify(replyMarkup)}`
      );
      continue;
    }
    if (!existsSync(target.path) || !existsSync(target.cover))
      throw new Error(`${target.cut}: not rendered; run --steps render`);
    const tg = makeTelegramCopy(target.path, fmt);
    const thumb = makeThumbnail(
      target.cover,
      join(dirname(tg), `thumb-${target.cut}.jpg`)
    );
    show("sendVideo", [
      target.cut,
      "→",
      String(chat),
      `${(statSync(tg).size / 1e6).toFixed(1)}MB`,
    ]);
    const sent = await sendVideo({
      token,
      chatId: chat,
      file: tg,
      thumb,
      caption,
      replyMarkup,
    });
    record(target, { ...sent, file: "video" });
  }
  // After the posts, every --prod post (this run's and earlier ones) is recorded on the Worker (`day_video_posts`) for
  // the day video watchdog. The record is an upsert, so a rerun fills in one that failed.
  const unrecorded = [];
  for (const r of real ? mine.filter((r) => r.telegram) : []) {
    try {
      run(
        "pnpm",
        ["--filter", "@aidr/web", "agent", ...dayVideoPostedArgs(date, r)],
        { cwd: REPO }
      );
    } catch (error) {
      console.error(`  ${r.cut}: posted, but not recorded: ${error.message}`);
      unrecorded.push(r.cut);
    }
  }
  if (unrecorded.length)
    throw new Error(
      `${unrecorded.join(", ")}: posted, but not recorded for the day video watchdog; rerun --steps telegram --prod to record`
    );
}

// Report.
console.log(`\n${dry ? "(dry run, nothing executed)\n" : ""}STATUS ${date}`);
for (const r of mine) {
  const bits = [
    r.state,
    r.voice !== undefined && (r.voice ? "voice" : "no voice"),
    r.duration && `${r.duration}s ${r.sizeMB}MB`,
    r.youtube?.url,
    r.uploadError &&
      `${r.youtube?.id ? "upload step failed after the upload" : "upload failed"}: ${r.uploadError.why}`,
    r.attached && "attached",
    r.facebook?.published && `facebook reel ${r.facebook.id}`,
    r.telegram && `telegram ${r.telegram.chat_id}/${r.telegram.message_id}`,
    r.telegramTest &&
      `telegram test ${r.telegramTest.chat_id}/${r.telegramTest.message_id}`,
  ].filter(Boolean);
  console.log(`  ${r.cut}: ${bits.join(" · ")}`);
}
