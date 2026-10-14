#!/usr/bin/env node
// Post a 9:16 video to the AI;DR Facebook Page as a Reel (Graph API Reels publishing for Pages).
// Used by publish.mjs (`--steps facebook`); also a standalone CLI for any 9:16 mp4 (release films too):
//   node scripts/facebook-reel.mjs --file <mp4> (--description <text> | --date <YYYY-MM-DD> [--lang en]) [--marker <text>] [--dry-run]
// --date takes the Facebook block of editions/<date>/posts.md as the caption and the day page as the link.
// --marker: skip when a recent Reel's description already contains it (default: the caption's link).
// Env (or the repo .env.local): FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN (a long-lived Page token),
// FACEBOOK_GRAPH_VERSION (optional, default as the Worker). ffmpeg/ffprobe: $FFMPEG/$FFPROBE or PATH.
//
// Flow (developers.facebook.com/docs/video-api/guides/reels-publishing):
//   1. POST /{version}/{page-id}/video_reels upload_phase=start           → { video_id, upload_url }
//   2. POST https://rupload.facebook.com/video-upload/{version}/{video_id}  (Authorization: OAuth <token>, offset, file_size, binary body)
//   3. POST /{version}/{page-id}/video_reels upload_phase=finish video_state=PUBLISHED description=…
//   4. GET  /{version}/{video_id}?fields=status until video_status=ready and publish_status=published
// Needs pages_show_list, pages_read_engagement and pages_manage_posts, and a Page token from a user with
// the CREATE_CONTENT task on the Page. Publishing is never retried blindly: after an unclear answer the
// status is polled instead (same rule as the Worker channel: repeating calls is how a Page gets restricted).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ENGAGEMENT_BAIT, gateVideo, lintText, probeStreams } from "./gate.mjs";
import { envVar, fmtCmd } from "./telegram-video.mjs";

// Same default as apps/web/worker/notify/facebook.ts (facebook-reel.test.mjs fails if they drift).
export const DEFAULT_GRAPH_VERSION = "v26.0";
export const GRAPH_ORIGIN = "https://graph.facebook.com";
export const RUPLOAD_ORIGIN = "https://rupload.facebook.com";
const PERMISSION_CODES = new Set([10, 190, 200]);
export const PERMISSION_HINT =
  "the Page token needs pages_show_list, pages_read_engagement and pages_manage_posts, from a user with the CREATE_CONTENT task on the Page; mint a long-lived Page token (aidr-facebook-token skill)";

export function graphVersion(raw) {
  const v = raw?.trim() || DEFAULT_GRAPH_VERSION;
  if (!/^v\d+\.\d+$/.test(v))
    throw new Error("FACEBOOK_GRAPH_VERSION is not a Graph version");
  return v;
}

/** Page id + token + version from env/.env.local; throws a clear error when missing. */
export function reelConfig(get = envVar) {
  const pageId = get("FACEBOOK_PAGE_ID")?.trim() ?? "";
  const token = get("FACEBOOK_PAGE_ACCESS_TOKEN")?.trim() ?? "";
  if (!pageId || !token)
    throw new Error(
      "FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN must be set (env or .env.local)"
    );
  if (!/^[A-Za-z0-9.]{3,64}$/.test(pageId))
    throw new Error("FACEBOOK_PAGE_ID is not a Page id");
  return {
    pageId,
    token,
    version: graphVersion(get("FACEBOOK_GRAPH_VERSION")),
  };
}

/** The day page, attributed to the Reel. */
export function reelLink(date, lang = "en") {
  const u = new URL(`https://aidr.today/date/${date}`);
  if (lang !== "en") u.searchParams.set("lang", lang);
  u.searchParams.set("utm_source", "facebook");
  u.searchParams.set("utm_medium", "reel");
  return u.toString();
}

/** The Reel caption: the posts.md Facebook block of a language, its day link swapped for the attributed one. */
export function reelCaption(postsMd, date, lang = "en") {
  const block = postsMd.match(
    new RegExp(`<!-- posts:${lang} -->[\\s\\S]*?<!-- /posts:${lang} -->`)
  )?.[0];
  const fb = block
    ?.match(/## Facebook Page[^\n]*\n\n([\s\S]*?)\n## /)?.[1]
    ?.trim();
  if (!fb) throw new Error(`posts.md has no Facebook block for ${lang}`);
  const day = `https://aidr.today/date/${date}${lang === "en" ? "" : `?lang=${lang}`}`;
  const link = reelLink(date, lang);
  return fb
    .split("\n")
    .map((l) => (l.trim().endsWith(day) ? l.replace(day, link) : l))
    .join("\n");
}

/** ffmpeg args for the Reels copy: 1080x1920 H.264 yuv420p, fixed 30 fps, closed 2 s GOP, AAC 48 kHz stereo. */
export function reelEncodeArgs(src, dst) {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    src,
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    "-maxrate",
    "10M",
    "-bufsize",
    "20M",
    "-g",
    "60",
    "-keyint_min",
    "60",
    "-sc_threshold",
    "0",
    "-flags",
    "+cgop",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    dst,
  ];
}

export const reelCopyPath = (src) => `${src.replace(/\.mp4$/i, "")}-reel.mp4`;

/** Make (or reuse) the Reels copy of a render. */
export function makeReelCopy(src) {
  const dst = reelCopyPath(src);
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs)
    return dst;
  const ff = process.env.FFMPEG || "ffmpeg";
  console.log(`  ${fmtCmd(ff, reelEncodeArgs(src, dst))}`);
  const r = spawnSync(ff, reelEncodeArgs(src, dst), {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0)
    throw new Error(
      `ffmpeg exited ${r.status}${r.error ? `: ${r.error.message}` : ""}`
    );
  return dst;
}

class GraphError extends Error {
  constructor(step, status, body, token) {
    const err = body?.error;
    const detail = String(err?.message ?? JSON.stringify(body) ?? "")
      .split(token)
      .join("[redacted]")
      .slice(0, 300);
    const hint = PERMISSION_CODES.has(err?.code) ? ` — ${PERMISSION_HINT}` : "";
    super(`Facebook ${step}: ${err?.code ?? status} ${detail}${hint}`);
    this.code = err?.code;
    this.status = status;
  }
}

async function call(fetchImpl, step, url, init, token) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    const err = new Error(`Facebook ${step}: no answer (${e.message})`);
    err.ambiguous = true;
    throw err;
  }
  const raw = await res.text();
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  if (!res.ok || !body || body.error) {
    const err = new GraphError(
      step,
      res.status,
      body ?? { error: { message: raw } },
      token
    );
    err.ambiguous = !body || res.status >= 500;
    throw err;
  }
  return body;
}

/** The request for one step. Exported so tests check the exact shape without the network. */
export function reelRequest(
  step,
  { pageId, token, version, videoId, bytes, description, data }
) {
  const graph = `${GRAPH_ORIGIN}/${version}`;
  const json = (body) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  switch (step) {
    case "start":
      return {
        url: `${graph}/${encodeURIComponent(pageId)}/video_reels`,
        init: json({ upload_phase: "start" }),
      };
    case "upload":
      return {
        url: `${RUPLOAD_ORIGIN}/video-upload/${version}/${encodeURIComponent(videoId)}`,
        init: {
          method: "POST",
          headers: {
            Authorization: `OAuth ${token}`,
            offset: "0",
            file_size: String(bytes),
            "content-type": "application/octet-stream",
          },
          body: data,
        },
      };
    case "finish":
      return {
        url: `${graph}/${encodeURIComponent(pageId)}/video_reels`,
        init: json({
          upload_phase: "finish",
          video_id: videoId,
          video_state: "PUBLISHED",
          description,
        }),
      };
    case "status":
      return {
        url: `${graph}/${encodeURIComponent(videoId)}?fields=status&access_token=${encodeURIComponent(token)}`,
        init: { method: "GET" },
      };
    case "list":
      return {
        url: `${graph}/${encodeURIComponent(pageId)}/video_reels?fields=id,description,created_time&limit=25&access_token=${encodeURIComponent(token)}`,
        init: { method: "GET" },
      };
    default:
      throw new Error(`unknown step ${step}`);
  }
}

/** A Reel on the Page whose description contains `marker`, or null. */
export async function findReel({
  pageId,
  token,
  version,
  marker,
  fetchImpl = fetch,
}) {
  const { url, init } = reelRequest("list", { pageId, token, version });
  const body = await call(fetchImpl, "list reels", url, init, token);
  const hit = (body.data ?? []).find(
    (r) => typeof r.description === "string" && r.description.includes(marker)
  );
  return hit ? { id: hit.id, created_time: hit.created_time } : null;
}

/** Poll until ready + published. Returns the last status; throws on error/expired/timeout. */
export async function waitForReel({
  token,
  version,
  videoId,
  fetchImpl = fetch,
  intervalMs = 10_000,
  timeoutMs = 15 * 60_000,
  sleep,
}) {
  const nap = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const until = Date.now() + timeoutMs;
  for (;;) {
    const { url, init } = reelRequest("status", { token, version, videoId });
    const { status } = await call(fetchImpl, "status", url, init, token);
    const v = status?.video_status;
    const pub =
      status?.publishing_phase?.publish_status ??
      status?.publishing_phase?.status;
    if (
      ["error", "expired", "upload_failed"].includes(v) ||
      status?.processing_phase?.status === "error" ||
      pub === "error"
    )
      throw new Error(
        `Facebook reel ${videoId}: ${v} ${JSON.stringify(status?.processing_phase?.error ?? status?.publishing_phase ?? {})}`
      );
    if (v === "ready" && (pub === "published" || pub === "complete"))
      return status;
    if (Date.now() > until)
      throw new Error(
        `Facebook reel ${videoId}: not published after ${timeoutMs / 60_000} min (last ${v}/${pub}); check the Page before rerunning`
      );
    await nap(intervalMs);
  }
}

/**
 * Upload and publish one Reel. `onVideoId(id)` runs right after `start` so the caller can save it:
 * a rerun with `resumeVideoId` only polls status, it never starts a second session for the same post.
 */
export async function postReel({
  file,
  description,
  pageId,
  token,
  version,
  fetchImpl = fetch,
  onVideoId,
  resumeVideoId,
  wait = {},
}) {
  if (ENGAGEMENT_BAIT.test(description))
    throw new Error("refused: the Reel description is engagement bait");
  if (resumeVideoId) {
    // A saved id from an earlier run: look once, then finish what that run left, or start over.
    const r = reelRequest("status", { token, version, videoId: resumeVideoId });
    const { status } = await call(fetchImpl, "status", r.url, r.init, token);
    const pub =
      status?.publishing_phase?.publish_status ??
      status?.publishing_phase?.status;
    const uploaded =
      status?.uploading_phase?.status === "complete" ||
      ["upload_complete", "processing", "ready"].includes(status?.video_status);
    if (
      ["published", "complete"].includes(pub) ||
      (pub && pub !== "not_started" && pub !== "error")
    ) {
      return {
        videoId: resumeVideoId,
        status: await waitForReel({
          token,
          version,
          videoId: resumeVideoId,
          fetchImpl,
          ...wait,
        }),
        resumed: true,
      };
    }
    if (uploaded && pub !== "error") {
      const f = reelRequest("finish", {
        pageId,
        token,
        version,
        videoId: resumeVideoId,
        description,
      });
      await call(fetchImpl, "finish", f.url, f.init, token).catch((e) => {
        if (!e.ambiguous) throw e;
      });
      return {
        videoId: resumeVideoId,
        status: await waitForReel({
          token,
          version,
          videoId: resumeVideoId,
          fetchImpl,
          ...wait,
        }),
        resumed: true,
      };
    }
    // Never uploaded, failed or expired: nothing is public, so a new session is safe.
    console.warn(
      `! reel ${resumeVideoId} is ${status?.video_status ?? "unknown"}; starting a new upload`
    );
  }
  const bytes = statSync(file).size;
  const s = reelRequest("start", { pageId, token, version });
  const started = await call(fetchImpl, "start", s.url, s.init, token);
  const videoId = started.video_id;
  if (!videoId)
    throw new Error(
      `Facebook start: no video_id in ${JSON.stringify(started)}`
    );
  await onVideoId?.(videoId);
  const u = reelRequest("upload", {
    token,
    version,
    videoId,
    bytes,
    data: readFileSync(file),
  });
  const up = await call(fetchImpl, "upload", u.url, u.init, token);
  if (up.success !== true)
    throw new Error(`Facebook upload: ${JSON.stringify(up)}`);
  const f = reelRequest("finish", {
    pageId,
    token,
    version,
    videoId,
    description,
  });
  try {
    const fin = await call(fetchImpl, "finish", f.url, f.init, token);
    if (fin.success !== true)
      throw new Error(`Facebook finish: ${JSON.stringify(fin)}`);
  } catch (e) {
    // The publish may have gone through: look, never post again.
    if (!e.ambiguous) throw e;
    console.warn(`! ${e.message}; polling the status instead of retrying`);
  }
  const status = await waitForReel({
    token,
    version,
    videoId,
    fetchImpl,
    ...wait,
  });
  return { videoId, status };
}

/** Gate a Reel file: problems from ffprobe + caption lint. */
export function reelProblems(file, description) {
  return [
    ...gateVideo(probeStreams(file), "reel"),
    ...lintText("description", description),
  ];
}

// --- CLI -----------------------------------------------------------------
if (resolve(process.argv[1] ?? "") === import.meta.filename) {
  const argv = process.argv.slice(2);
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const dry = argv.includes("--dry-run");
  const src = flag("--file");
  const date = flag("--date");
  const lang = flag("--lang") ?? "en";
  if (!src || !existsSync(src) || (!flag("--description") && !date)) {
    console.error(
      "usage: facebook-reel.mjs --file <mp4> (--description <text> | --date <YYYY-MM-DD> [--lang en]) [--marker <text>] [--dry-run]"
    );
    process.exit(2);
  }
  const description =
    flag("--description") ??
    reelCaption(
      readFileSync(
        resolve(import.meta.dirname, "../editions", date, "posts.md"),
        "utf8"
      ),
      date,
      lang
    );
  const marker =
    flag("--marker") ??
    (date
      ? `aidr.today/date/${date}`
      : description.match(/https?:\/\/\S+/)?.[0]);
  const copy = makeReelCopy(resolve(src));
  const problems = reelProblems(copy, description);
  if (problems.length) {
    console.error(`✗ gate: ${copy}\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`✓ gate: ${copy}`);
  if (dry) {
    console.log(
      `(dry run) would post a Reel, marker ${marker ?? "-"}, description:\n${description}`
    );
    process.exit(0);
  }
  const cfg = reelConfig();
  if (marker) {
    const found = await findReel({ ...cfg, marker });
    if (found) {
      console.log(
        `= already on the Page as reel ${found.id} (${found.created_time}); not posting again`
      );
      process.exit(0);
    }
  }
  const out = await postReel({
    ...cfg,
    file: copy,
    description,
    onVideoId: (id) => console.log(`  video_id ${id}`),
  });
  console.log(`✓ reel ${out.videoId} published\nID=${out.videoId}`);
}
