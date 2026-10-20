#!/usr/bin/env node
// Send one release cut to Telegram as a native video, from this machine (Bot API multipart upload, 50 MB cap).
// Uploads the social copy (scripts/social.sh: 16:9 → -x.mp4, 9:16 → -tiktok.mp4, both under 28 MB),
// with the YouTube title as caption and Release notes / YouTube buttons. Records the message on the
// cut's STATUS.json row and refuses to post the same cut to the same chat twice (Telegram cannot unpost).
// Staging chat ($TELEGRAM_STAGING_CHAT_ID) unless --chat <id> or --prod (TELEGRAM_EN_CHAT_ID / TELEGRAM_VI_CHAT_ID).
// TELEGRAM_BOT_TOKEN and chat ids come from the environment, then the repo .env.local.
// Usage: scripts/telegram.mjs v0.1.13-en-16x9 [--chat <id>] [--prod] [--dry-run]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { siteLink } from "../../daily-news/scripts/site-links.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const REPO = resolve(ROOT, "../..");
const argv = process.argv.slice(2);
const cut = argv[0];
const m = cut?.match(/^(v\d+\.\d+\.\d+)-(en|vi)-(16x9|9x16)$/);
if (!m)
  throw new Error(
    "usage: telegram.mjs v<x.y.z>-<en|vi>-<16x9|9x16> [--chat <id>] [--prod] [--dry-run]"
  );
const [, version, lang, fmt] = m;
const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
const prod = argv.includes("--prod");
const dry = argv.includes("--dry-run");

function env(name) {
  if (process.env[name]) return process.env[name];
  const f = join(REPO, ".env.local");
  if (!existsSync(f)) return null;
  return (
    readFileSync(f, "utf8").match(
      new RegExp(`^${name}=["']?([^"'\\s#]+)`, "m")
    )?.[1] ?? null
  );
}

const token = env("TELEGRAM_BOT_TOKEN");
const chat =
  flag("--chat") ??
  (prod
    ? env(lang === "en" ? "TELEGRAM_EN_CHAT_ID" : "TELEGRAM_VI_CHAT_ID")
    : env("TELEGRAM_STAGING_CHAT_ID"));
if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN is not set (env or .env.local)");
if (!chat)
  throw new Error(
    prod
      ? `no ${lang} prod chat id`
      : "no staging chat: set TELEGRAM_STAGING_CHAT_ID or pass --chat <id>"
  );

const statusPath = join(ROOT, "STATUS.json");
const rows = JSON.parse(readFileSync(statusPath, "utf8"));
const row = rows.find((r) => r.cut === cut);
if (!row) throw new Error(`${cut}: no row in STATUS.json`);
const sent = (row.telegram ?? []).find((t) => t.chat_id === chat);
if (sent) {
  console.log(
    `${cut}: already posted to chat ${chat} as message ${sent.message_id}; skipping`
  );
  process.exit(0);
}

// The social copy; social.sh writes it on demand.
const master = join(ROOT, version, "renders", `aidr-${cut}.mp4`);
const file = master.replace(
  /\.mp4$/,
  fmt === "16x9" ? "-x.mp4" : "-tiktok.mp4"
);
if (!existsSync(file)) {
  if (!existsSync(master)) throw new Error(`${master} is not rendered`);
  console.log(`$ scripts/social.sh ${cut}`);
  if (!dry)
    execFileSync(join(ROOT, "scripts/social.sh"), [cut], {
      cwd: ROOT,
      stdio: "inherit",
    });
}
const probe = (...a) =>
  execFileSync("ffprobe", ["-v", "error", ...a, file], {
    encoding: "utf8",
  }).trim();
const [width, height] =
  dry && !existsSync(file)
    ? [0, 0]
    : probe(
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0"
      )
        .split(",")
        .map(Number);
const duration =
  dry && !existsSync(file)
    ? 0
    : Math.round(
        Number(probe("-show_entries", "format=duration", "-of", "csv=p=0"))
      );

const md = readFileSync(join(ROOT, version, "youtube.md"), "utf8");
const section = md
  .split(/^## /m)
  .find(
    (s) =>
      s.startsWith(lang === "en" ? "English" : "Tiếng Việt") ||
      s.startsWith(lang === "en" ? "English" : "Vietnamese")
  );
const title =
  section?.match(/### Title\s+\n([^\n]+)/)?.[1]?.trim() ?? `AI;DR ${version}`;
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const notes = siteLink(
  `https://aidr.today/release/${version}${lang === "vi" ? "?lang=vi" : ""}`,
  {
    source: "telegram",
    medium: "social",
    campaign: `release-${version}`,
    content: "button",
  }
);
const caption = `<b>${esc(title)}</b>\n\n${lang === "en" ? "New on AI;DR. What changed" : "Có gì mới trên AI;DR"}: ${notes}`;
const buttons = [
  [{ text: lang === "en" ? "Release notes" : "Ghi chú phát hành", url: notes }],
];
if (row.youtubeUrl) buttons[0].push({ text: "▶ YouTube", url: row.youtubeUrl });

console.log(
  `▶ telegram ${cut} → chat ${chat}${prod ? " (PRODUCTION)" : flag("--chat") ? "" : " (staging)"}`
);
console.log(`  ${basename(file)} ${width}x${height} ${duration}s\n  ${title}`);
if (dry) process.exit(0);

const form = new FormData();
form.set("chat_id", chat);
form.set(
  "video",
  new Blob([readFileSync(file)], { type: "video/mp4" }),
  basename(file)
);
form.set("caption", caption);
form.set("parse_mode", "HTML");
form.set("supports_streaming", "true");
form.set("width", String(width));
form.set("height", String(height));
form.set("duration", String(duration));
form.set("reply_markup", JSON.stringify({ inline_keyboard: buttons }));
const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
  method: "POST",
  body: form,
});
const body = await res.json().catch(() => ({}));
if (!body.ok)
  throw new Error(
    `sendVideo failed (${res.status}): ${body.description ?? "no description"}`
  );

row.telegram = [
  ...(row.telegram ?? []),
  { chat_id: chat, message_id: body.result.message_id, prod },
];
writeFileSync(statusPath, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`MESSAGE_ID=${body.result.message_id}`);
