#!/usr/bin/env node
// The daily runner: render → upload → attach → telegram, idempotent per cut.
// State lives in editions/<date>/STATUS.json (ignored): one row per cut. A step skips cuts it already
// finished (YouTube cannot replace a file, Telegram cannot unpost), so rerunning is always safe.
// The runner never writes scripts: script.json (and script.vi.json) must be written first.
// Usage: node scripts/publish.mjs <date> [--lang en,vi] [--steps render,upload,attach,telegram]
//        [--no-voice] [--chat <telegram chat id>] [--prod] [--telegram-fmt 16x9|9x16] [--telegram-mode video|card]
//        [--dry-run] [--uploader chrome|api] [--privacy private|unlisted|public]
// --uploader api (YouTube Data API, headless) is the default when YOUTUBE_REFRESH_TOKEN is set, else chrome (owner's Chrome).
// --privacy applies to the api uploader only (default public).
// Telegram uploads the video file itself (sendVideo, a <50 MB copy next to the render; needs only the render, the YouTube button
// appears when the cut has an id). It goes to $TELEGRAM_STAGING_CHAT_ID (from .env.local) unless --chat is given; --prod posts to
// the real channels. --telegram-mode card keeps the old Worker path (YouTube thumbnail card; needs the attached ids).
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cutFor } from "./lang.mjs";
import { envVar, makeTelegramCopy, makeThumbnail, sendVideo, tgCopyPath, tgEncodeArgs, videoCaption, videoReplyMarkup } from "./telegram-video.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REPO = resolve(ROOT, "../..");
const STEPS = ["render", "upload", "attach", "telegram"];
const argv = process.argv.slice(2);
const date = argv[0];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))
  throw new Error(
    "usage: publish.mjs <date> [--lang en,vi] [--steps render,upload,attach,telegram] [--no-voice] [--chat <id>] [--prod] [--telegram-fmt 16x9|9x16] [--telegram-mode video|card] [--dry-run] [--uploader chrome|api] [--privacy private|unlisted|public]"
  );
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const list = (n, all) => (flag(n) ? flag(n).split(",").filter(Boolean) : all);
const langs = list("--lang", ["en", "vi"]);
const steps = list("--steps", STEPS);
const uploader = flag("--uploader") ?? (process.env.YOUTUBE_REFRESH_TOKEN ? "api" : "chrome");
const privacy = flag("--privacy") ?? "public";
const dry = argv.includes("--dry-run");
const prod = argv.includes("--prod");
const noVoice = argv.includes("--no-voice");
const tgFmt = flag("--telegram-fmt") ?? "16x9";
const tgMode = flag("--telegram-mode") ?? "video";
if (!["16x9", "9x16"].includes(tgFmt)) throw new Error(`--telegram-fmt ${tgFmt}: 16x9 | 9x16`);
if (!["video", "card"].includes(tgMode)) throw new Error(`--telegram-mode ${tgMode}: video | card`);
for (const l of langs) if (!["en", "vi"].includes(l)) throw new Error(`--lang ${l}: en | vi`);
if (!["chrome", "api"].includes(uploader)) throw new Error(`--uploader ${uploader}: chrome | api`);
if (!["private", "unlisted", "public"].includes(privacy)) throw new Error(`--privacy ${privacy}: private | unlisted | public`);
for (const s of steps) if (!STEPS.includes(s)) throw new Error(`--steps ${s}: ${STEPS.join(" | ")}`);

const dir = join(ROOT, "editions", date);
const statusPath = join(dir, "STATUS.json");
const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const FMT_KIND = { "16x9": "long", "9x16": "short" };
const q = (a) => (/^[\w./:=@,-]+$/.test(a) ? a : JSON.stringify(a));
const show = (cmd, args) => console.log(`$ ${[cmd, ...args].map(q).join(" ")}`);

// Run a command (or print it with --dry-run). Returns stdout; stdio is shown live on stderr.
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
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
  return r.stdout;
}

// 0. Precondition: every requested language has a finished script.
const draft = (l) => {
  const file = join(dir, cutFor(l).script);
  if (!existsSync(file)) return `${file} is missing`;
  const bad = readFileSync(file, "utf8")
    .split("\n")
    .filter((s) => s.includes("TODO") || s.includes('"_bullet"'));
  return bad.length ? `${file} is still a draft (${bad.length} TODO/_bullet lines)` : null;
};
const problems = langs.map(draft).filter(Boolean);
if (problems.length) {
  console.error(
    `✗ The newsroom writing pass (an agent) is required first; publish.mjs does not write scripts:\n  ${problems.join("\n  ")}\n` +
      "  English: node scripts/new.mjs, then rewrite script.json. Vietnamese: write script.vi.json from text_vi."
  );
  process.exit(1);
}

// State.
const rows = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, "utf8")) : [];
const save = () => !dry && writeFileSync(statusPath, `${JSON.stringify(rows, null, 2)}\n`);
const cutName = (l, f) => `${date}-${l}-${f}`;
for (const l of langs)
  for (const f of Object.keys(config.formats)) {
    const cut = cutName(l, f);
    if (!rows.some((r) => r.cut === cut)) {
      const c = cutFor(l);
      rows.push({
        cut,
        lang: l,
        fmt: f,
        path: join(dir, "renders", c.video(date, f)),
        cover: join(dir, "renders", c.cover(date, f)),
        state: "queued",
      });
    }
  }
const mine = rows.filter((r) => langs.includes(r.lang));
const byLang = (l) => mine.filter((r) => r.lang === l);
const probe = (file, ...a) =>
  execFileSync("ffprobe", ["-v", "error", ...a, file], { encoding: "utf8" }).trim();

// The YouTube title of a language's block in posts.md.
function ytTitle(l) {
  const md = readFileSync(join(dir, "posts.md"), "utf8");
  const block = md.match(new RegExp(`<!-- posts:${l} -->[\\s\\S]*?<!-- /posts:${l} -->`))?.[0] ?? "";
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
  console.log(`\n▶ ${what}: ${targets.length ? targets.join(", ") : "nothing to do"}`);

// 1. Render.
if (steps.includes("render")) {
  const rendered = new Set();
  for (const l of langs) {
    const todo = byLang(l).filter((r) => !existsSync(r.path) || !existsSync(r.cover));
    summary(`render ${l}`, todo.map((r) => r.cut));
    if (!todo.length) continue;
    if (!dry) {
      for (const r of todo) r.state = "rendering";
      save();
    }
    run(process.execPath, [join(ROOT, "scripts/daily.mjs"), date, ...cutFor(l).args, "--render", ...(noVoice ? ["--no-voice"] : [])]);
    for (const r of todo) rendered.add(r.cut);
  }
  for (const r of mine) {
    if (dry) continue;
    if (!existsSync(r.path)) continue;
    r.duration = Number(Number(probe(r.path, "-show_entries", "format=duration", "-of", "csv=p=0")).toFixed(2));
    r.sizeMB = Number((statSync(r.path).size / 1e6).toFixed(1));
    if (!["uploaded", "attached", "posted"].includes(r.state)) r.state = "rendered";
    // Whether the cut has narration: build.mjs records it in the language's timeline.json.
    const tl = join(dir, cutFor(r.lang).timeline);
    if ((rendered.has(r.cut) || r.voice === undefined) && existsSync(tl))
      r.voice = JSON.parse(readFileSync(tl, "utf8")).voice !== false;
  }
  save();
}

// 2. Upload, serially, in the owner's Chrome. Stops on the first failure.
// STATUS.json is local, so first take ids already on the live day page: a date
// uploaded elsewhere must not get a second public copy.
async function seedFromSite() {
  for (const l of langs) {
    const res = await fetch(`https://aidr.today/date/${date}.md?lang=${l}`);
    if (!res.ok) continue;
    const md = await res.text();
    const ids = {
      "16x9": md.match(/^- YouTube: \S+watch\?v=([\w-]{11})/m)?.[1],
      "9x16": md.match(/^- YouTube Shorts: \S+\/shorts\/([\w-]{11})/m)?.[1],
    };
    for (const r of byLang(l)) {
      const id = ids[r.fmt];
      if (!id || r.youtube?.id) continue;
      // A Worker without per-language videos serves the EN ids on ?lang=vi; one video never serves both cuts.
      if (rows.some((o) => o.lang !== l && o.youtube?.id === id)) continue;
      console.log(`  ${r.cut}: already on ${date} day page as ${id}, skipping upload`);
      r.youtube = { id, url: `https://youtu.be/${id}`, seeded: true };
      r.attached = true;
      if (!["posted"].includes(r.state)) r.state = "attached";
    }
  }
  if (!dry) save();
}

if (steps.includes("upload")) {
  await seedFromSite();
  const todo = mine.filter((r) => !r.youtube?.id);
  summary(uploader === "api" ? `upload to YouTube (${privacy}, Data API)` : "upload to YouTube (public, owner's Chrome)", todo.map((r) => r.cut));
  for (const r of todo) {
    if (!dry && !existsSync(r.path)) throw new Error(`${r.cut}: ${r.path} is not rendered; run --steps render`);
    const kind = FMT_KIND[r.fmt];
    const args = [r.path, "--meta", join(dir, "posts.md"), "--lang", r.lang, "--kind", kind];
    if (r.fmt === "16x9") args.push("--cover", r.cover);
    const bin = join(REPO, ".agents/skills/aidr-youtube-upload/bin", uploader === "api" ? "yt-upload-api.mjs" : "yt-upload");
    if (uploader === "api") args.push("--privacy", privacy);
    const out = run(bin, args);
    if (dry) continue;
    const id = out.match(/^ID=(\S+)/m)?.[1];
    const url = out.match(/^URL=(\S+)/m)?.[1];
    if (!id) throw new Error(`${r.cut}: uploader printed no ID=; stopping`);
    r.youtube = { id, url, oembed: out.match(/^OEMBED=(.*)$/m)?.[1] };
    r.state = "uploaded";
    save();
  }
}

// 3. Attach the YouTube ids to the day page, per language (needs both cuts of the language).
if (steps.includes("attach")) {
  const todo = langs.filter((l) => byLang(l).some((r) => (dry || r.youtube?.id) && !r.attached));
  summary("attach to the day page", todo);
  for (const l of todo) {
    const long = byLang(l).find((r) => r.fmt === "16x9");
    const short = byLang(l).find((r) => r.fmt === "9x16");
    if (!dry && !(long?.youtube?.id && short?.youtube?.id))
      throw new Error(`${l}: both YouTube ids are needed to attach; run --steps upload`);
    const title = ytTitle(l);
    const args = ["--filter", "@aidr/web", "agent", "day-video", date, "--lang", l, "--video", long?.youtube?.id ?? "<16x9 id>", "--short", short?.youtube?.id ?? "<9x16 id>"];
    if (title) args.push("--title", title);
    const out = run("pnpm", args, { cwd: REPO });
    // A Worker without per-language day videos ignores `lang` and would write VI ids into the EN columns.
    if (!dry && !out.includes(`"lang": "${l}"`) && !out.includes(`"lang":"${l}"`))
      throw new Error(`${l}: the day-video response has no lang=${l}; is the per-language Worker (migration 0052) deployed?`);
    for (const r of dry ? [] : byLang(l)) {
      r.attached = true;
      if (r.state === "uploaded") r.state = "attached";
    }
    save();
  }
}

// 4. Telegram, once per language: the video file itself (default) or the Worker's YouTube card.
// Chats: --chat <id> for every language; else staging; with --prod each language's channel (env, else the wrangler.toml default).
const PROD_CHATS = { en: ["TELEGRAM_EN_CHAT_ID", "@aidr_today"], vi: ["TELEGRAM_VI_CHAT_ID", "-1004420104760"] };
if (steps.includes("telegram")) {
  const override = flag("--chat");
  const staging = envVar("TELEGRAM_STAGING_CHAT_ID");
  if (!prod && !override && !staging && !dry) throw new Error("no staging chat: set TELEGRAM_STAGING_CHAT_ID (.env.local), pass --chat <id>, or --prod");
  const chatFor = (l) => override ?? (prod ? (envVar(PROD_CHATS[l][0]) ?? PROD_CHATS[l][1]) : staging);
  const where = prod && !override ? "PRODUCTION channels" : `chat ${override ?? staging ?? "$TELEGRAM_STAGING_CHAT_ID"}${prod ? "" : " (staging)"}`;
  const fmt = tgMode === "card" ? "16x9" : tgFmt;
  const todo = langs.filter((l) => byLang(l).some((r) => r.fmt === fmt && !r.telegram));
  summary(`telegram ${tgMode === "card" ? "card" : `video ${fmt}`} → ${where}`, todo);
  const token = envVar("TELEGRAM_BOT_TOKEN");
  if (tgMode === "video" && todo.length && !token && !dry) throw new Error("TELEGRAM_BOT_TOKEN is not set (env or .env.local)");
  for (const l of todo) {
    const target = byLang(l).find((r) => r.fmt === fmt);
    const chat = chatFor(l);
    if (tgMode === "card") {
      const args = ["--filter", "@aidr/web", "agent", "day-video-telegram", date, "--lang", l];
      if (chat) args.push("--chat", chat);
      const out = run("pnpm", args, { cwd: REPO });
      if (dry) continue;
      const json = lastJson(out);
      const message_id = find(json, "message_id");
      if (message_id === undefined) throw new Error(`${l}: no message_id in day-video-telegram output`);
      target.telegram = { chat_id: find(json, "chat_id") ?? chat ?? "prod", message_id };
      target.state = "posted";
      save();
      continue;
    }
    const title = ytTitle(l) ?? (l === "vi" ? `Bản tin AI;DR — ${date}` : `AI;DR Daily Brief — ${date}`);
    const markup = videoReplyMarkup({ date, lang: l, youtubeId: target.youtube?.id });
    const copy = tgCopyPath(target.path);
    if (dry) {
      show(process.env.FFMPEG || "ffmpeg", tgEncodeArgs(target.path, copy, fmt));
      console.log(`  sendVideo ${target.cut} → ${chat}: ${videoCaption(title)} ${JSON.stringify(markup)}`);
      continue;
    }
    if (!existsSync(target.path) || !existsSync(target.cover)) throw new Error(`${target.cut}: not rendered; run --steps render`);
    const tg = makeTelegramCopy(target.path, fmt);
    const thumb = makeThumbnail(target.cover, join(dirname(tg), `thumb-${target.cut}.jpg`));
    show("sendVideo", [target.cut, "→", String(chat), `${(statSync(tg).size / 1e6).toFixed(1)}MB`]);
    const sent = await sendVideo({ token, chatId: chat, file: tg, thumb, caption: videoCaption(title), replyMarkup: markup });
    target.telegram = { ...sent, file: "video" };
    target.state = "posted";
    save();
  }
}

// Report.
console.log(`\n${dry ? "(dry run, nothing executed)\n" : ""}STATUS ${date}`);
for (const r of mine) {
  const bits = [
    r.state,
    r.voice !== undefined && (r.voice ? "voice" : "no voice"),
    r.duration && `${r.duration}s ${r.sizeMB}MB`,
    r.youtube?.url,
    r.attached && "attached",
    r.telegram && `telegram ${r.telegram.chat_id}/${r.telegram.message_id}`,
  ].filter(Boolean);
  console.log(`  ${r.cut}: ${bits.join(" · ")}`);
}
