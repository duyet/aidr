#!/usr/bin/env node
// The daily runner: render → upload → attach → telegram, idempotent per cut.
// State lives in editions/<date>/STATUS.json (ignored): one row per cut. A step skips cuts it already
// finished (YouTube cannot replace a file, Telegram cannot unpost), so rerunning is always safe.
// The runner never writes scripts: script.json (and script.vi.json) must be written first.
// Usage: node scripts/publish.mjs <date> [--lang en,vi] [--steps render,upload,attach,telegram]
//        [--chat <telegram chat id>] [--prod] [--dry-run]
// Telegram goes to $TELEGRAM_STAGING_CHAT_ID (from .env.local) unless --chat is given; --prod posts to the real channels.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { cutFor } from "./lang.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REPO = resolve(ROOT, "../..");
const STEPS = ["render", "upload", "attach", "telegram"];
const argv = process.argv.slice(2);
const date = argv[0];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))
  throw new Error(
    "usage: publish.mjs <date> [--lang en,vi] [--steps render,upload,attach,telegram] [--chat <id>] [--prod] [--dry-run]"
  );
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const list = (n, all) => (flag(n) ? flag(n).split(",").filter(Boolean) : all);
const langs = list("--lang", ["en", "vi"]);
const steps = list("--steps", STEPS);
const dry = argv.includes("--dry-run");
const prod = argv.includes("--prod");
for (const l of langs) if (!["en", "vi"].includes(l)) throw new Error(`--lang ${l}: en | vi`);
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

// env from .env.local for the staging chat.
function stagingChat() {
  if (process.env.TELEGRAM_STAGING_CHAT_ID) return process.env.TELEGRAM_STAGING_CHAT_ID;
  const f = join(REPO, ".env.local");
  if (!existsSync(f)) return null;
  const m = readFileSync(f, "utf8").match(/^TELEGRAM_STAGING_CHAT_ID=["']?([^"'\s#]+)/m);
  return m?.[1] ?? null;
}

const summary = (what, targets) =>
  console.log(`\n▶ ${what}: ${targets.length ? targets.join(", ") : "nothing to do"}`);

// 1. Render.
if (steps.includes("render")) {
  for (const l of langs) {
    const todo = byLang(l).filter((r) => !existsSync(r.path) || !existsSync(r.cover));
    summary(`render ${l}`, todo.map((r) => r.cut));
    if (!todo.length) continue;
    if (!dry) {
      for (const r of todo) r.state = "rendering";
      save();
    }
    run(process.execPath, [join(ROOT, "scripts/daily.mjs"), date, ...cutFor(l).args, "--render"]);
  }
  for (const r of mine) {
    if (dry) continue;
    if (!existsSync(r.path)) continue;
    r.duration = Number(Number(probe(r.path, "-show_entries", "format=duration", "-of", "csv=p=0")).toFixed(2));
    r.sizeMB = Number((statSync(r.path).size / 1e6).toFixed(1));
    if (!["uploaded", "attached", "posted"].includes(r.state)) r.state = "rendered";
  }
  save();
}

// 2. Upload, serially, in the owner's Chrome. Stops on the first failure.
if (steps.includes("upload")) {
  const todo = mine.filter((r) => !r.youtube?.id);
  summary("upload to YouTube (public, owner's Chrome)", todo.map((r) => r.cut));
  for (const r of todo) {
    if (!dry && !existsSync(r.path)) throw new Error(`${r.cut}: ${r.path} is not rendered; run --steps render`);
    const kind = FMT_KIND[r.fmt];
    const args = [r.path, "--meta", join(dir, "posts.md"), "--lang", r.lang, "--kind", kind];
    if (r.fmt === "16x9") args.push("--cover", r.cover);
    const out = run(join(REPO, ".agents/skills/aidr-youtube-upload/bin/yt-upload"), args);
    if (dry) continue;
    const id = out.match(/^ID=(\S+)/m)?.[1];
    const url = out.match(/^URL=(\S+)/m)?.[1];
    if (!id) throw new Error(`${r.cut}: yt-upload printed no ID=; stopping`);
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
    run("pnpm", args, { cwd: REPO });
    for (const r of dry ? [] : byLang(l)) {
      r.attached = true;
      if (r.state === "uploaded") r.state = "attached";
    }
    save();
  }
}

// 4. Telegram, once per language.
if (steps.includes("telegram")) {
  const chat = flag("--chat") ?? (prod ? null : stagingChat());
  if (!prod && !chat && !dry) throw new Error("no staging chat: set TELEGRAM_STAGING_CHAT_ID (.env.local), pass --chat <id>, or --prod");
  const where = prod && !flag("--chat") ? "PRODUCTION channels" : `chat ${chat ?? "$TELEGRAM_STAGING_CHAT_ID"}${prod ? "" : " (staging)"}`;
  const todo = langs.filter((l) => byLang(l).some((r) => r.fmt === "16x9" && !r.telegram));
  summary(`telegram → ${where}`, todo);
  for (const l of todo) {
    const target = byLang(l).find((r) => r.fmt === "16x9");
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
  }
}

// Report.
console.log(`\n${dry ? "(dry run, nothing executed)\n" : ""}STATUS ${date}`);
for (const r of mine) {
  const bits = [
    r.state,
    r.duration && `${r.duration}s ${r.sizeMB}MB`,
    r.youtube?.url,
    r.attached && "attached",
    r.telegram && `telegram ${r.telegram.chat_id}/${r.telegram.message_id}`,
  ].filter(Boolean);
  console.log(`  ${r.cut}: ${bits.join(" · ")}`);
}
