#!/usr/bin/env node
// Send a day video to Telegram as a real video (Bot API sendVideo, multipart), not a YouTube link card.
// Used by publish.mjs; also runnable alone to test a send:
//   node scripts/telegram-video.mjs --file clip.mp4 --chat <id> [--fmt 16x9|9x16] [--caption "Title"] [--lang en|vi] [--date YYYY-MM-DD] [--youtube <id>]
// Needs TELEGRAM_BOT_TOKEN (env or the repo .env.local). ffmpeg/ffprobe: $FFMPEG/$FFPROBE else PATH (ffprobe is optional).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../..");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";
// The Bot API rejects uploads over 50 MB; stay under it with margin.
export const TG_LIMIT_BYTES = 49e6;
const AUDIO_KBPS = 128;

/** An env var from the process, else from the repo .env.local. */
export function envVar(name) {
  if (process.env[name]) return process.env[name];
  const f = join(REPO, ".env.local");
  if (!existsSync(f)) return null;
  return readFileSync(f, "utf8").match(new RegExp(`^${name}=["']?([^"'\\s#]+)`, "m"))?.[1] ?? null;
}

const q = (a) => (/^[\w./:=@,%-]+$/.test(a) ? a : JSON.stringify(a));
export const fmtCmd = (cmd, args) => [cmd, ...args].map(q).join(" ");

/** Duration (s), size and dimensions of a video. ffprobe when present, else parse `ffmpeg -i` stderr. */
export function probeMedia(file) {
  const bytes = statSync(file).size;
  const p = spawnSync(
    FFPROBE,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file],
    { encoding: "utf8" }
  );
  if (p.status === 0) {
    const j = JSON.parse(p.stdout);
    return { duration: Number(j.format.duration), width: j.streams[0].width, height: j.streams[0].height, bytes };
  }
  const e = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const err = e.stderr ?? "";
  const d = err.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = err.match(/Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!d || !v) throw new Error(`cannot read duration/size of ${file} (ffprobe ${p.error ? "missing" : "failed"}; ffmpeg -i gave no Duration/Video line)`);
  return { duration: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]), width: Number(v[1]), height: Number(v[2]), bytes };
}

/** The Telegram copy of a render: `<name>-tg.mp4` next to it. */
export const tgCopyPath = (src) => src.replace(/\.mp4$/i, "") + "-tg.mp4";

/** ffmpeg args for the Telegram copy. `kbps` set = target video bitrate (size retry), else CRF. */
export function tgEncodeArgs(src, dst, fmt, kbps) {
  const scale = fmt === "9x16" ? "scale=1080:-2" : "scale=1920:-2";
  const rate = kbps ? ["-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`] : ["-crf", "23", "-maxrate", "8M", "-bufsize", "16M"];
  return [
    "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-vf", scale, "-c:v", "libx264", "-preset", "medium",
    "-profile:v", "high", "-pix_fmt", "yuv420p", ...rate, "-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`, "-movflags", "+faststart", dst,
  ];
}

const ff = (args) => {
  const r = spawnSync(FFMPEG, args, { encoding: "utf8", stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`ffmpeg exited ${r.status}${r.error ? `: ${r.error.message}` : ""}`);
};

/** Make (or reuse) the under-50 MB copy. Returns its path. */
export function makeTelegramCopy(src, fmt) {
  const dst = tgCopyPath(src);
  const { duration } = probeMedia(src);
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs && statSync(dst).size <= TG_LIMIT_BYTES) return dst;
  console.log(`  ${fmtCmd(FFMPEG, tgEncodeArgs(src, dst, fmt))}`);
  ff(tgEncodeArgs(src, dst, fmt));
  if (statSync(dst).size > TG_LIMIT_BYTES) {
    const kbps = Math.floor((TG_LIMIT_BYTES * 8 * 0.95) / duration / 1000 - AUDIO_KBPS);
    if (kbps < 200) throw new Error(`${basename(src)}: ${duration.toFixed(0)}s is too long for the 50 MB Telegram limit`);
    console.log(`  ${(statSync(dst).size / 1e6).toFixed(1)} MB is over the limit; retrying at ${kbps} kbps`);
    ff(tgEncodeArgs(src, dst, fmt, kbps));
    if (statSync(dst).size > TG_LIMIT_BYTES) throw new Error(`${basename(dst)} is still ${(statSync(dst).size / 1e6).toFixed(1)} MB after the bitrate retry`);
  }
  return dst;
}

/** Cover (or any image/video frame) as a JPEG with its long side at most 320 px, under Telegram's 200 kB thumbnail cap. */
export function makeThumbnail(src, dst) {
  const scale = "scale='if(gt(iw,ih),min(320,iw),-2)':'if(gt(iw,ih),-2,min(320,ih))'";
  for (const qv of ["4", "8", "14"]) {
    ff(["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-frames:v", "1", "-vf", scale, "-q:v", qv, dst]);
    if (statSync(dst).size <= 200_000) return dst;
  }
  throw new Error(`${basename(dst)} is over 200 kB`);
}

/** Same links as the Worker's digestDayUrl: /date/<date>?lang=<l>&utm_source=telegram. */
export function dayUrl(date, lang) {
  const u = new URL(`https://aidr.today/date/${date}`);
  u.searchParams.set("lang", lang);
  u.searchParams.set("utm_source", "telegram");
  return u.toString();
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Bold title, HTML-escaped, safely under the 1024-char caption cap. */
export function videoCaption(title) {
  const t = title.length > 200 ? `${title.slice(0, 199)}…` : title;
  return `<b>${escapeHtml(t)}</b>`;
}

/** "▶ YouTube" only when the cut has an id; the day page always. */
export function videoReplyMarkup({ date, lang, youtubeId }) {
  const row = [];
  if (youtubeId) row.push({ text: "▶ YouTube", url: `https://youtu.be/${youtubeId}` });
  row.push({ text: lang === "en" ? "Day page on aidr.today" : "Trang ngày trên aidr.today", url: dayUrl(date, lang) });
  return { inline_keyboard: [row] };
}

/** sendVideo with a file upload. Throws with Telegram's own error; never falls back to a link post. */
export async function sendVideo({ token, chatId, file, thumb, caption, replyMarkup }) {
  const { duration, width, height } = probeMedia(file);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("video", new Blob([readFileSync(file)], { type: "video/mp4" }), basename(file));
  form.set("thumbnail", new Blob([readFileSync(thumb)], { type: "image/jpeg" }), "thumb.jpg");
  form.set("duration", String(Math.round(duration)));
  form.set("width", String(width));
  form.set("height", String(height));
  form.set("supports_streaming", "true");
  form.set("caption", caption);
  form.set("parse_mode", "HTML");
  form.set("reply_markup", JSON.stringify(replyMarkup));
  const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(`Telegram sendVideo failed: ${res.status} ${json?.error_code ?? ""} ${json?.description ?? "no JSON body"}`.trim());
  return { chat_id: json.result.chat.id, message_id: json.result.message_id };
}

// Standalone test path.
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
  const file = flag("--file");
  const chat = flag("--chat");
  if (!file || !chat) throw new Error("usage: telegram-video.mjs --file <mp4> --chat <id> [--fmt 16x9|9x16] [--caption <title>] [--lang en|vi] [--date YYYY-MM-DD] [--youtube <id>]");
  const token = envVar("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set (env or .env.local)");
  const fmt = flag("--fmt", "16x9");
  const lang = flag("--lang", "en");
  const copy = makeTelegramCopy(resolve(file), fmt);
  const thumb = makeThumbnail(resolve(flag("--cover") ?? copy), `${dirname(copy)}/thumb-${basename(copy, ".mp4")}.jpg`);
  const out = await sendVideo({
    token,
    chatId: chat,
    file: copy,
    thumb,
    caption: videoCaption(flag("--caption", "AI;DR video test")),
    replyMarkup: videoReplyMarkup({ date: flag("--date", "2026-10-10"), lang, youtubeId: flag("--youtube") }),
  });
  console.log(JSON.stringify(out));
}
