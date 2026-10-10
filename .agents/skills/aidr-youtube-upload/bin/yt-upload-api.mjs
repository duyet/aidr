#!/usr/bin/env node
// Upload one AI;DR cut through the YouTube Data API v3 (headless; no Chrome).
//
//   yt-upload-api.mjs <mp4> --meta <youtube.md|posts.md> --lang en|vi --kind long|short
//                     [--cover <png>] [--privacy private|unlisted|public]
//
// Same args and output as bin/yt-upload (ID=, URL=, OEMBED=), default public.
// Env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
// (mint the token once with bin/yt-oauth.mjs). Metadata comes from bin/yt-meta.py.
// Steps: refresh token -> resumable upload -> thumbnail (long only) -> playlist
// "AI;DR" -> oEmbed (public only). Any error prints `FAIL: <step>` and exits 1.
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";

const BIN = import.meta.dirname;
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const PLAYLIST = "AI;DR";
const THUMB_MAX = 2_000_000; // YouTube limit is 2 MB
const log = (...a) => console.error("[yt-upload-api]", ...a);
const usage = () => {
  console.error(readFileSync(import.meta.filename, "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(2);
};
const fail = (step, detail) => {
  console.log(`FAIL: ${step}${detail ? ` (${detail})` : ""}`);
  process.exit(1);
};

// --- args ---------------------------------------------------------------
const argv = process.argv.slice(2);
let mp4 = "", metaSrc = "", lang = "", kind = "", cover = "", privacy = "public";
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--meta") metaSrc = argv[++i];
  else if (a === "--lang") lang = argv[++i];
  else if (a === "--kind") kind = argv[++i];
  else if (a === "--cover") cover = argv[++i];
  else if (a === "--privacy") privacy = argv[++i];
  else if (a === "-h" || a === "--help" || a.startsWith("-")) usage();
  else mp4 = a;
}
if (!(mp4 && existsSync(mp4) && metaSrc && existsSync(metaSrc))) usage();
if (!["en", "vi"].includes(lang) || !["long", "short"].includes(kind)) usage();
if (!["private", "unlisted", "public"].includes(privacy)) usage();
if (cover && !existsSync(cover)) {
  console.error(`cover not found: ${cover}`);
  process.exit(2);
}
mp4 = resolve(mp4);

// --- metadata (same parser as yt-upload) --------------------------------
let meta;
try {
  const flag = readFileSync(metaSrc, "utf8").includes("<!-- posts:") ? "--daily" : "--release";
  meta = JSON.parse(
    execFileSync("python3", ["-I", join(BIN, "yt-meta.py"), flag, metaSrc, "--lang", lang, "--kind", kind], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    })
  );
} catch (e) {
  fail("metadata", e.message.split("\n")[0]);
}
let { title, desc } = meta;
const tags = meta.tags.split(",").map((t) => t.trim()).filter(Boolean);
if (kind === "short" && !/#shorts/i.test(`${title}\n${desc}`)) title = `${title} #Shorts`;
if ([...title].length > 100) fail("metadata", `title is ${[...title].length} chars, max 100`);
if (Buffer.byteLength(desc) > 5000) fail("metadata", "description over 5000 bytes");

// --- helpers --------------------------------------------------------------
const missing = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) fail("env", `missing ${missing.join(", ")}`);

async function jsonOrText(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
const errText = (b) => (typeof b === "string" ? b.slice(0, 300) : (b?.error?.message ?? b?.error_description ?? b?.error ?? JSON.stringify(b)).toString().slice(0, 300));

let token = "";
async function call(step, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  const body = await jsonOrText(res);
  if (!res.ok) fail(step, `HTTP ${res.status}: ${errText(body)}`);
  return body;
}

// --- 1. refresh token -----------------------------------------------------
log("refresh token");
{
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const body = await jsonOrText(res);
  if (!res.ok || !body.access_token) fail("token", `HTTP ${res.status}: ${errText(body)}`);
  token = body.access_token;
}

// The token belongs to whichever channel was picked on the consent screen; a personal channel
// there would publish AI;DR videos in the wrong place.
const CHANNEL = process.env.YOUTUBE_CHANNEL_ID || "UCGDB5uD8znydgMg2XLOj04w";
{
  const me = await call("channel", `${API}/channels?part=snippet&mine=true`);
  const ch = me.items?.[0];
  if (ch?.id !== CHANNEL)
    fail("channel", `token is for ${ch?.id ?? "no channel"} (${ch?.snippet?.title ?? "-"}), expected ${CHANNEL}; re-run yt-oauth.mjs and pick the AI;DR channel`);
  log(`channel ${ch.snippet.title} (${ch.id})`);
}

// --- 2. resumable upload --------------------------------------------------
const size = statSync(mp4).size;
log(`upload ${basename(mp4)} (${(size / 1e6).toFixed(1)} MB) as ${privacy}`);
const resource = {
  snippet: { title, description: desc, tags, categoryId: "28", defaultLanguage: lang, defaultAudioLanguage: lang },
  // yt-upload answers "No" to the altered/synthetic-content question for AI;DR films.
  status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
};
const init = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json; charset=UTF-8",
    "x-upload-content-length": String(size),
    "x-upload-content-type": "video/mp4",
  },
  body: JSON.stringify(resource),
});
if (!init.ok) fail("upload-init", `HTTP ${init.status}: ${errText(await jsonOrText(init))}`);
const sessionUrl = init.headers.get("location");
if (!sessionUrl) fail("upload-init", "no Location header");
const put = await fetch(sessionUrl, {
  method: "PUT",
  headers: { "content-length": String(size), "content-type": "video/mp4" },
  body: Readable.toWeb(createReadStream(mp4)),
  duplex: "half",
});
const video = await jsonOrText(put);
if (!put.ok || !video?.id) fail("upload", `HTTP ${put.status}: ${errText(video)}`);
const id = video.id;
log(`id=${id}`);
const url = kind === "short" ? `https://www.youtube.com/shorts/${id}` : `https://youtu.be/${id}`;
console.log(`ID=${id}`);

// --- 3. thumbnail (long only) ---------------------------------------------
if (kind === "long" && cover) {
  log("thumbnail");
  let file = resolve(cover);
  let tmp = "";
  try {
    if (statSync(file).size >= THUMB_MAX) {
      tmp = mkdtempSync(join(tmpdir(), "yt-thumb-"));
      const out = join(tmp, "thumb.jpg");
      try {
        execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", "scale=1920:-2", "-q:v", "3", out], { stdio: ["ignore", "inherit", "inherit"] });
      } catch (e) {
        fail("thumbnail", `ffmpeg convert failed: ${e.message.split("\n")[0]} (video ${id} is uploaded)`);
      }
      file = out;
      if (statSync(file).size >= THUMB_MAX) fail("thumbnail", `converted cover still ${statSync(file).size} bytes (video ${id} is uploaded)`);
    }
    const type = extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    await call(`thumbnail (video ${id} is uploaded)`, `${UPLOAD}/thumbnails/set?videoId=${id}`, {
      method: "POST",
      headers: { "content-type": type },
      body: readFileSync(file),
    });
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4. playlist "AI;DR" ---------------------------------------------------
log(`playlist ${PLAYLIST}`);
{
  let pageToken = "";
  let playlistId = "";
  do {
    const q = new URLSearchParams({ part: "snippet", mine: "true", maxResults: "50", ...(pageToken && { pageToken }) });
    const list = await call(`playlist lookup (video ${id} is uploaded)`, `${API}/playlists?${q}`);
    playlistId = list.items?.find((p) => p.snippet.title === PLAYLIST)?.id ?? "";
    pageToken = playlistId ? "" : (list.nextPageToken ?? "");
  } while (pageToken);
  if (!playlistId) fail("playlist", `no playlist titled "${PLAYLIST}" (video ${id} is uploaded)`);
  await call(`playlist add (video ${id} is uploaded)`, `${API}/playlistItems?part=snippet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: id } } }),
  });
}

// --- 5. oEmbed (public only): 200 = public, 403 = private, 401/404 = not visible yet
console.log(`URL=${url}`);
if (privacy !== "public") {
  console.log(`OEMBED=skipped (${privacy})`);
  process.exit(0);
}
let code = 0;
for (let i = 0; i < 6; i++) {
  code = (await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}`)).status;
  if (code === 200) break;
  await new Promise((r) => setTimeout(r, 10_000));
}
if (code === 200) console.log("OEMBED=200 public");
else {
  console.log(`OEMBED=${code} (not public yet; 403 means still private)`);
  process.exit(1);
}
