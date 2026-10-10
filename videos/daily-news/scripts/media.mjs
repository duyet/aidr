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

// Saves the image to <dir>/assets/<base>.<ext>; returns "assets/<file>", or null when it is not an image.
export async function download(dir, url, base) {
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow" });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !EXT[type]) return null;
    const file = `${base}.${EXT[type]}`;
    writeFileSync(
      join(dir, "assets", file),
      Buffer.from(await res.arrayBuffer())
    );
    return `assets/${file}`;
  } catch {
    return null;
  }
}

// A written script is tied to the edition it was written from.
export const hasWrittenScript = (dir) =>
  ["script.json", "script.vi.json"].some((f) => {
    const p = join(dir, f);
    return existsSync(p) && !/TODO|"_bullet"/.test(readFileSync(p, "utf8"));
  });
