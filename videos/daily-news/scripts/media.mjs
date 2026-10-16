// Shared by fetch.mjs (daily) and fetch-week.mjs (weekly): the request headers, the media download,
// and the guard that stops a refetch from pairing a written script with other stories' media.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const UA = {
  "user-agent":
    "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36",
};

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Saves the image to <dir>/assets/<base>.<ext>; returns "assets/<file>", or null when it is not an image or is
// smaller than MIN_IMAGE_SIDE.
export async function download(dir, url, base) {
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !EXT[type]) return null;
    const body = Buffer.from(await res.arrayBuffer());
    const size = imageSize(body);
    if (size && Math.min(size.width, size.height) < MIN_IMAGE_SIDE) return null;
    const file = `${base}.${EXT[type]}`;
    writeFileSync(join(dir, "assets", file), body);
    return `assets/${file}`;
  } catch {
    return null;
  }
}

// Ported from isGenericImageUrl in apps/web/worker/media.ts (keep in step): avatars, logos, icons and
// placeholders show a person or a brand, not the story.
const BLOCKED_IMAGE_URLS = new Set(["https://huggingnews.com/og-image.png"]);
export function isGenericImageUrl(url) {
  if (BLOCKED_IMAGE_URLS.has(url)) return true;
  let pathname;
  let hostname;
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname.toLowerCase();
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return true;
  }
  if (
    hostname === "pbs.twimg.com" &&
    /^\/profile_(?:images|banners)\//.test(pathname)
  )
    return true;
  if (/^\/(?:.+\/)?(?:avatars?|profile_images)\//.test(pathname)) return true;
  let filename;
  try {
    filename = decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return true;
  }
  filename = filename.replace(/\.[a-z0-9]+$/, "").replace(/[._-]+/g, "-");
  return /(^|-)(logo|favicon|site-icon|icon|avatar|placeholder|default|default-image|og-image|brand|brandmark|wordmark|spacer|pixel|blank)(-|$)/.test(
    filename
  );
}

const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** { width, height } from a PNG, GIF, JPEG or WebP header, or null when the header is not one it can read. */
export function imageSize(buf) {
  const ascii = (at, n) => buf.toString("latin1", at, at + n);
  if (buf.length >= 24 && ascii(1, 3) === "PNG")
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length >= 10 && ascii(0, 4) === "GIF8")
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ")
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    if (chunk === "VP8L") {
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X")
      return {
        width: buf.readUIntLE(24, 3) + 1,
        height: buf.readUIntLE(27, 3) + 1,
      };
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 <= buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (JPEG_SOF.has(marker))
        return {
          width: buf.readUInt16BE(i + 7),
          height: buf.readUInt16BE(i + 5),
        };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// A story picture fills a half frame or more; below this short side it is a thumbnail or an avatar, enlarged to a blur.
export const MIN_IMAGE_SIDE = 300;

// Downloads up to `max` of `urls` as <base>-1, <base>-2, ...; skips generic pictures and any image whose short
// side is under MIN_IMAGE_SIDE. An image whose header it cannot read is kept.
export async function downloadImages(dir, urls, base, max = 3) {
  const images = [];
  for (const url of new Set(urls)) {
    if (images.length >= max) break;
    if (isGenericImageUrl(url)) continue;
    const local = await download(dir, url, `${base}-${images.length + 1}`);
    if (local) images.push({ url, local });
  }
  return images;
}

// A written script is tied to the edition it was written from.
export const hasWrittenScript = (dir) =>
  ["script.json", "script.vi.json"].some((f) => {
    const p = join(dir, f);
    return existsSync(p) && !/TODO|"_bullet"/.test(readFileSync(p, "utf8"));
  });
