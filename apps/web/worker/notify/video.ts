import { fetchWithSafeRedirects, redactUrlForLog } from "../enrich.js";
import {
  canonicalizeMediaImageUrl,
  canonicalizeMediaUrl,
  type MediaAsset,
  mediaIdentityKey,
} from "../media.js";
import { preflightIvRemoteMedia } from "../telegram-iv.js";
import type { StoryPayload } from "./types.js";

/**
 * Bounded video preflight and delivery plan for the Telegram adapter.
 *
 * The Worker never downloads a video and never proxies one: Telegram fetches
 * the remote URL itself. Before that, a few Range requests prove the file is
 * small enough, MPEG-4, and of known duration. Anything unproven is skipped
 * with a reason and delivery falls back to the poster photo, then text.
 */

/** Bot API `sendVideo` by HTTP URL: 20 MB. */
export const TELEGRAM_VIDEO_URL_BYTES = 20 * 1024 * 1024;
/** Total video bytes one album may ask Telegram to fetch. */
export const TELEGRAM_ALBUM_VIDEO_BYTES = 40 * 1024 * 1024;
/** Longest clip we post. Telegram has no cap; this keeps the channel tidy. */
export const TELEGRAM_VIDEO_MAX_SECONDS = 300;
/** `sendMediaGroup` accepts 2-10 items. */
export const TELEGRAM_ALBUM_MAX_ITEMS = 10;
/** Bot API thumbnail: JPEG, at most 200 KB, at most 320 px per side. */
export const TELEGRAM_THUMBNAIL_BYTES = 200 * 1024;
export const TELEGRAM_THUMBNAIL_SIDE = 320;

const HEAD_BYTES = 256 * 1024;
const MOOV_MAX_BYTES = 2 * 1024 * 1024;
const MAX_BOX_HOPS = 6;
const MAX_VIDEO_PROBES = 3;
const PROBE_TIMEOUT_MS = 8_000;
const MP4_MIME = "video/mp4";

export type VideoSkipReason =
  | "unsafe_url"
  | "unreachable"
  | "size_unknown"
  | "oversized"
  | "not_mp4"
  | "duration_unknown"
  | "too_long";

export interface VideoProbe {
  ok: boolean;
  reason: VideoSkipReason | null;
  bytes: number | null;
  durationSeconds: number | null;
}

interface RangeResult {
  bytes: Uint8Array;
  /** Total resource size from Content-Range / Content-Length, if known. */
  total: number | null;
  contentType: string;
}

async function readRange(
  url: string,
  start: number,
  length: number
): Promise<RangeResult | null> {
  let res: Response;
  try {
    res = await fetchWithSafeRedirects(url, {
      method: "GET",
      headers: {
        Range: `bytes=${start}-${start + length - 1}`,
        Accept: MP4_MIME,
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  // A 200 past offset 0 means the server ignored Range and would stream the
  // whole file, so only a first-window 200 is tolerated (and cancelled below).
  if (res.status !== 206 && !(res.status === 200 && start === 0)) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  const range = res.headers.get("content-range")?.match(/\/(\d+)\s*$/);
  const declared = Number(res.headers.get("content-length"));
  const total = range
    ? Number(range[1])
    : res.status === 200 && Number.isFinite(declared) && declared > 0
      ? declared
      : null;
  const out = new Uint8Array(length);
  let read = 0;
  try {
    const reader = res.body?.getReader();
    if (reader) {
      while (read < length) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const slice = value.subarray(0, length - read);
        out.set(slice, read);
        read += slice.byteLength;
      }
      await reader.cancel().catch(() => undefined);
    }
  } catch {
    return null;
  }
  return { bytes: out.subarray(0, read), total, contentType };
}

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function u32(b: Uint8Array, at: number): number {
  return view(b).getUint32(at);
}

function u64(b: Uint8Array, at: number): number {
  return u32(b, at) * 2 ** 32 + u32(b, at + 4);
}

function fourcc(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

interface BoxHeader {
  type: string;
  /** Total box size in bytes; 0 when the box runs to end of file. */
  size: number;
  headerSize: number;
}

function readBoxHeader(b: Uint8Array, at: number): BoxHeader | null {
  if (at + 8 > b.byteLength) return null;
  const type = fourcc(b, at + 4);
  const size32 = u32(b, at);
  if (size32 === 1) {
    if (at + 16 > b.byteLength) return null;
    return { type, size: u64(b, at + 8), headerSize: 16 };
  }
  return { type, size: size32, headerSize: 8 };
}

/** True for an ISO base media file that is MP4 (not QuickTime `qt  `). */
export function isMp4Container(head: Uint8Array): boolean {
  const box = readBoxHeader(head, 0);
  if (box?.type !== "ftyp" || box.size < 12) return false;
  return fourcc(head, box.headerSize) !== "qt  ";
}

/** Movie duration in seconds from a complete `moov` box, else null. */
export function parseMoovDuration(moov: Uint8Array): number | null {
  const outer = readBoxHeader(moov, 0);
  if (outer?.type !== "moov") return null;
  let at = outer.headerSize;
  while (at + 8 <= moov.byteLength) {
    const box = readBoxHeader(moov, at);
    if (!box || box.size < box.headerSize) return null;
    if (box.type === "mvhd") {
      const body = at + box.headerSize;
      const v1 = moov[body] === 1;
      const scaleAt = body + (v1 ? 20 : 12);
      const durAt = scaleAt + 4;
      if (durAt + (v1 ? 8 : 4) > moov.byteLength) return null;
      const timescale = u32(moov, scaleAt);
      const duration = v1 ? u64(moov, durAt) : u32(moov, durAt);
      if (!timescale) return null;
      return duration / timescale;
    }
    at += box.size;
  }
  return null;
}

/**
 * Walk top-level boxes with bounded Range hops until `moov` is found. Handles
 * both faststart (moov first) and non-faststart (moov after mdat) files.
 */
async function findDuration(
  url: string,
  head: Uint8Array,
  total: number
): Promise<number | null> {
  let cursor = 0;
  for (let hop = 0; hop < MAX_BOX_HOPS && cursor < total; hop++) {
    const header =
      cursor + 16 <= head.byteLength
        ? head.subarray(cursor)
        : ((await readRange(url, cursor, 16))?.bytes ?? null);
    const box = header ? readBoxHeader(header, 0) : null;
    if (!box || box.size < box.headerSize) return null;
    if (box.type === "moov") {
      if (box.size > MOOV_MAX_BYTES) return null;
      const body =
        cursor + box.size <= head.byteLength
          ? head.subarray(cursor, cursor + box.size)
          : ((await readRange(url, cursor, box.size))?.bytes ?? null);
      if (!body || body.byteLength < box.size) return null;
      return parseMoovDuration(body);
    }
    cursor += box.size;
  }
  return null;
}

/** Prove one video URL is sendable. Never throws, never reads a whole file. */
export async function probeVideo(url: string): Promise<VideoProbe> {
  const fail = (
    reason: VideoSkipReason,
    bytes: number | null = null,
    durationSeconds: number | null = null
  ): VideoProbe => ({ ok: false, reason, bytes, durationSeconds });

  const safe = canonicalizeMediaUrl(url);
  if (!safe) return fail("unsafe_url");
  const head = await readRange(safe, 0, HEAD_BYTES);
  if (!head) return fail("unreachable");
  if (head.total === null) return fail("size_unknown");
  if (head.total > TELEGRAM_VIDEO_URL_BYTES) {
    return fail("oversized", head.total);
  }
  if (head.contentType !== MP4_MIME || !isMp4Container(head.bytes)) {
    return fail("not_mp4", head.total);
  }
  const duration = await findDuration(safe, head.bytes, head.total);
  if (duration === null) return fail("duration_unknown", head.total);
  if (duration > TELEGRAM_VIDEO_MAX_SECONDS) {
    return fail("too_long", head.total, duration);
  }
  return {
    ok: true,
    reason: null,
    bytes: head.total,
    durationSeconds: Math.max(1, Math.round(duration)),
  };
}

export interface PlannedVideo {
  url: string;
  poster: string | null;
  bytes: number;
  durationSeconds: number;
}

export type VideoItem =
  | { type: "video"; video: PlannedVideo }
  | { type: "photo"; url: string };

export type VideoDelivery =
  | { method: "sendVideo"; video: PlannedVideo; thumbnail: string | null }
  | { method: "sendMediaGroup"; items: VideoItem[] };

/** A poster is a legal Bot API thumbnail only if JPEG, <=200 KB, <=320 px. */
async function legalThumbnail(poster: string | null): Promise<string | null> {
  if (!poster) return null;
  const probe = await preflightIvRemoteMedia(poster, {
    maxBytes: TELEGRAM_THUMBNAIL_BYTES,
  });
  const dims = probe.dimensions;
  const ok =
    probe.mime === "image/jpeg" &&
    dims !== null &&
    dims.width > 0 &&
    dims.width <= TELEGRAM_THUMBNAIL_SIDE &&
    dims.height <= TELEGRAM_THUMBNAIL_SIDE;
  return ok ? poster : null;
}

/**
 * Decide how to deliver a story that has video, or null to use the existing
 * photo/text path. Fails closed: an album over the item or byte cap is dropped
 * whole, never truncated. Skips are logged with a redacted origin only.
 */
export async function planVideoDelivery(
  story: StoryPayload
): Promise<VideoDelivery | null> {
  const assets: MediaAsset[] = story.media_manifest?.assets ?? [];
  if (!assets.some((asset) => asset.type === "video")) return null;

  const seen = new Set<string>();
  const isNew = (type: "image" | "video", url: string): boolean => {
    const key = mediaIdentityKey(type, url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const items: VideoItem[] = [];
  let probes = 0;
  let primary: PlannedVideo | null = null;
  for (const asset of assets) {
    if (asset.type === "image") {
      const url = canonicalizeMediaImageUrl(asset.url);
      if (url && isNew("image", url)) items.push({ type: "photo", url });
      continue;
    }
    const url = canonicalizeMediaUrl(asset.url);
    if (!url || !isNew("video", url) || probes >= MAX_VIDEO_PROBES) continue;
    probes++;
    const probe = await probeVideo(url);
    if (!probe.ok || probe.bytes === null || probe.durationSeconds === null) {
      console.warn(
        `telegram video skipped for ${story.id} ${redactUrlForLog(url)}: ${probe.reason}`
      );
      continue;
    }
    const posterUrl = canonicalizeMediaImageUrl(asset.poster_url);
    const video: PlannedVideo = {
      url,
      poster: posterUrl && isNew("image", posterUrl) ? posterUrl : null,
      bytes: probe.bytes,
      durationSeconds: probe.durationSeconds,
    };
    if (!primary) {
      primary = video;
      // Primary video first, then its poster, then the rest in manifest order.
      items.unshift({ type: "video", video });
      if (video.poster) {
        items.splice(1, 0, { type: "photo", url: video.poster });
      }
    } else {
      items.push({ type: "video", video });
    }
  }
  if (!primary) return null;

  const videos = items.filter((item) => item.type === "video");
  const stills = items.filter(
    (item) => item.type === "photo" && item.url !== primary.poster
  );
  if (videos.length === 1 && stills.length === 0) {
    return {
      method: "sendVideo",
      video: primary,
      thumbnail: await legalThumbnail(primary.poster),
    };
  }
  if (items.length > TELEGRAM_ALBUM_MAX_ITEMS) {
    console.warn(`telegram album skipped for ${story.id}: too many items`);
    return null;
  }
  const videoBytes = videos.reduce(
    (sum, item) => sum + (item.type === "video" ? item.video.bytes : 0),
    0
  );
  if (videoBytes > TELEGRAM_ALBUM_VIDEO_BYTES) {
    console.warn(`telegram album skipped for ${story.id}: over byte budget`);
    return null;
  }
  return { method: "sendMediaGroup", items };
}

/** `sendMediaGroup` `media` array; caption and parse_mode on item 0 only. */
export function buildVideoAlbumMedia(
  items: VideoItem[],
  caption: string
): Array<Record<string, unknown>> {
  return items.map((item, index) => {
    const base =
      item.type === "video"
        ? {
            type: "video",
            media: item.video.url,
            duration: item.video.durationSeconds,
            supports_streaming: true,
          }
        : { type: "photo", media: item.url };
    return index === 0 ? { ...base, caption, parse_mode: "HTML" } : base;
  });
}
