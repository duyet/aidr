/**
 * Second chance for a story photo Telegram could not fetch by URL.
 *
 * `sendPhoto` with a URL makes Telegram's own fetcher download the image, and
 * some hosts refuse it (hotlink rules, user agents, a 5 MB URL ceiling). The
 * Worker is a different client and can often read the same file, then upload
 * the bytes as multipart, where the ceiling is 10 MB. Only a definite
 * rejection about the URL or its size qualifies, so a post that may already
 * be in the channel is never sent again.
 */

import { fetchWithSafeRedirects } from "../enrich.js";
import { TELEGRAM_IV_LIMITS } from "../telegram-iv.js";
import { isSubrequestLimitError } from "./types.js";

export const PHOTO_DOWNLOAD_TIMEOUT_MS = 10_000;

/** Bot API descriptions that mean "Telegram could not take this URL". */
const URL_REJECTION =
  /failed to get HTTP URL content|wrong file identifier\/HTTP URL|wrong type of the web page content|WEBPAGE_CURL_FAILED|WEBPAGE_MEDIA_EMPTY|file is too big|request entity too large/i;

export function isUrlFetchRejection(description: string | undefined): boolean {
  return description !== undefined && URL_REJECTION.test(description);
}

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "photo.jpg",
  "image/png": "photo.png",
  "image/webp": "photo.webp",
};

export type PhotoDownload =
  | { ok: true; blob: Blob; filename: string }
  /** `reason` is a fixed code: it reaches `last_error` and Bugsink, so it
   *  never carries a URL, a query string, or a fetch error message. */
  | { ok: false; reason: string; budgetExhausted?: boolean };

async function readCapped(
  res: Response,
  capBytes: number
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > capBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Downloads an image for upload. The URL already passed the media guard (https,
 * public host); `fetchWithSafeRedirects` re-checks every redirect hop. Bounded
 * by a timeout and the multipart size ceiling, and the response must be a
 * JPEG, PNG or WebP by `content-type`.
 */
export async function downloadPhoto(url: string): Promise<PhotoDownload> {
  const cap = TELEGRAM_IV_LIMITS.multipartUploadPhotoBytes;
  let res: Response;
  try {
    res = await fetchWithSafeRedirects(url, {
      signal: AbortSignal.timeout(PHOTO_DOWNLOAD_TIMEOUT_MS),
      headers: { accept: "image/jpeg,image/png,image/webp" },
    });
  } catch (error) {
    return isSubrequestLimitError(error)
      ? { ok: false, reason: "upload:budget_exhausted", budgetExhausted: true }
      : { ok: false, reason: "upload:download_failed" };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, reason: `upload:download_http_${res.status}` };
  }
  const type = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase();
  const filename = type ? IMAGE_TYPES[type] : undefined;
  if (!type || !filename) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, reason: "upload:not_a_photo" };
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    await res.body?.cancel().catch(() => {});
    return { ok: false, reason: "upload:too_large" };
  }
  try {
    const bytes = await readCapped(res, cap);
    if (!bytes) return { ok: false, reason: "upload:too_large" };
    if (bytes.length === 0) return { ok: false, reason: "upload:empty" };
    return { ok: true, blob: new Blob([bytes], { type }), filename };
  } catch (error) {
    return isSubrequestLimitError(error)
      ? { ok: false, reason: "upload:budget_exhausted", budgetExhausted: true }
      : { ok: false, reason: "upload:download_failed" };
  }
}
