// Quality gate before any upload: the file is a real video with sound, and the Reel copy fits
// Facebook's Reels spec. Pure checks (`gateVideo`, `lintText`) are unit-tested; `probeStreams` reads
// the facts with ffprobe.
// Reels spec (developers.facebook.com/docs/video-api/guides/reels-publishing): 3–90 s, 9:16,
// at least 540x960 (1080x1920 recommended), 24–60 fps, H.264/AAC.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

export const REEL_LIMITS = {
  minSeconds: 3,
  maxSeconds: 90,
  minWidth: 540,
  minHeight: 960,
  minFps: 24,
  maxFps: 60,
  // Meta lists no Reels file cap; this keeps the upload sane (the 1080p copy is ~20–60 MB).
  maxBytes: 1e9,
};

// Same pattern as the Worker's Facebook channel (apps/web/worker/notify/facebook.ts ENGAGEMENT_BAIT);
// gate.test.mjs fails if the two drift.
export const ENGAGEMENT_BAIT =
  /\b(like and share|tag a friend|comment (yes|below)|share if you agree)\b/i;

const FFPROBE = process.env.FFPROBE || "ffprobe";

/** ffprobe facts: duration, size, first video stream (w, h, fps, codec), first audio stream (codec, rate, channels). */
export function probeStreams(file) {
  const p = spawnSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels", "-of", "json", file],
    { encoding: "utf8" }
  );
  if (p.status !== 0) throw new Error(`ffprobe ${file}: ${p.error?.message ?? p.stderr.trim()}`);
  return { ...JSON.parse(p.stdout), bytes: statSync(file).size };
}

const fps = (rate) => {
  const [n, d] = String(rate ?? "0/1").split("/").map(Number);
  return d ? n / d : n;
};

/**
 * Problems with a probed file (empty = pass). `kind` "reel" applies the Reels limits;
 * "any" only asks for non-empty video and audio streams and a real duration.
 */
export function gateVideo(probe, kind = "reel", limits = REEL_LIMITS) {
  const problems = [];
  const streams = probe.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const duration = Number(probe.format?.duration ?? 0);
  if (!v) problems.push("no video stream");
  if (!a) problems.push("no audio stream");
  if (!(duration > 0)) problems.push("no duration");
  if (!(probe.bytes > 0)) problems.push("empty file");
  if (kind !== "reel") return problems;
  if (duration && duration < limits.minSeconds) problems.push(`${duration.toFixed(1)}s is shorter than ${limits.minSeconds}s`);
  if (duration > limits.maxSeconds) problems.push(`${duration.toFixed(1)}s is longer than the ${limits.maxSeconds}s Reel limit`);
  if (probe.bytes > limits.maxBytes) problems.push(`${(probe.bytes / 1e6).toFixed(0)} MB is over ${(limits.maxBytes / 1e6).toFixed(0)} MB`);
  if (v) {
    if (!v.width || !v.height || Math.abs(v.width / v.height - 9 / 16) > 0.01) problems.push(`${v.width}x${v.height} is not 9:16`);
    else if (v.width < limits.minWidth || v.height < limits.minHeight) problems.push(`${v.width}x${v.height} is under ${limits.minWidth}x${limits.minHeight}`);
    const f = fps(v.avg_frame_rate);
    if (f < limits.minFps || f > limits.maxFps) problems.push(`${f.toFixed(2)} fps is outside ${limits.minFps}–${limits.maxFps}`);
  }
  return problems;
}

/** Problems with post or spoken text (empty = pass): engagement bait, leftover TODO, empty. */
export function lintText(label, text) {
  const t = String(text ?? "").trim();
  if (!t) return [`${label}: empty`];
  const problems = [];
  if (ENGAGEMENT_BAIT.test(t)) problems.push(`${label}: engagement bait ("${t.match(ENGAGEMENT_BAIT)[0]}")`);
  if (/\bTODO\b/.test(t)) problems.push(`${label}: TODO left`);
  return problems;
}

/** Every spoken and on-screen line of a script.json, labelled, for lintText. */
export function scriptTexts(script) {
  const out = [];
  const voice = (label, v) => {
    for (const [i, p] of (Array.isArray(v) ? v : [{ text: v }]).entries()) out.push([`${label}.voice[${i}]`, p.text]);
  };
  voice("intro", script.intro?.voice ?? []);
  for (const s of script.stories ?? []) {
    out.push([`story ${s.rank}.headline`, s.headline], [`story ${s.rank}.kicker`, s.kicker]);
    voice(`story ${s.rank}`, s.voice ?? []);
  }
  voice("outro", script.outro?.voice ?? []);
  for (const k of ["hook", "facebook"]) if (script.post?.[k] !== undefined) out.push([`post.${k}`, script.post[k]]);
  return out;
}
