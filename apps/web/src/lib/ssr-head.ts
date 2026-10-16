/**
 * The one rewrite of a server-rendered page's <head>, done in the Worker on
 * the streamed response. Bytes are held until `</head>` arrives (it comes in
 * the first chunk), then the rest streams through untouched.
 */
import { URL_PRIVACY_BOOT_SCRIPT } from "./analytics/url-privacy";
import { type AssetsFetcher, inlineStylesheets } from "./inline-stylesheet";

const HEAD_START = /<head[\s>]/i;
const HEAD_END = new TextEncoder().encode("</head>");

/**
 * The URL privacy boot script goes ahead of the `<head>` tag. React hoists
 * its stylesheets to the top of <head>, and Cloudflare's edge inserts the
 * Google tag gateway's async gtag.js loader right after the `<head>` tag.
 * An async script does not wait for a pending stylesheet, so a boot script
 * anywhere inside <head> could run after gtag.js had read the URL. The
 * parser opens <head> for this script and ignores the later tag, so the
 * script is still the first child of <head>.
 */
export function withBootScriptFirst(html: string): string {
  const match = HEAD_START.exec(html);
  if (!match) return html;
  return `${html.slice(0, match.index)}<script>${URL_PRIVACY_BOOT_SCRIPT}</script>${html.slice(match.index)}`;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function indexOfHeadEnd(bytes: Uint8Array): number {
  const last = bytes.byteLength - HEAD_END.byteLength;
  for (let i = bytes.indexOf(HEAD_END[0]); i !== -1 && i <= last; ) {
    if (HEAD_END.every((b, j) => bytes[i + j] === b)) return i;
    i = bytes.indexOf(HEAD_END[0], i + 1);
  }
  return -1;
}

function rewriteHeadStream(
  response: Response,
  rewrite: (head: string) => Promise<string>
): Response {
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.body || !type.includes("text/html")) return response;

  // A BOM is head text the rewrite must keep, so the decoder may not strip it.
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  const encoder = new TextEncoder();
  // `</head>` is found in the raw bytes and only the head is decoded, so
  // the body after it is forwarded as it came. Each chunk is searched
  // with the last few held bytes in front, which catches a tag split
  // between chunks without rescanning everything held.
  let held: Uint8Array[] = [];
  let heldBytes = 0;
  let tail = new Uint8Array(0);
  let headDone = false;

  const stream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      if (headDone) {
        controller.enqueue(chunk);
        return;
      }
      held.push(chunk);
      const window = concat([tail, chunk]);
      const at = indexOfHeadEnd(window);
      if (at === -1) {
        heldBytes += chunk.byteLength;
        tail = window.slice(-(HEAD_END.byteLength - 1));
        return;
      }
      const cut = heldBytes - tail.byteLength + at + HEAD_END.byteLength;
      const bytes = concat(held);
      headDone = true;
      held = [];
      const head = await rewrite(decoder.decode(bytes.subarray(0, cut)));
      controller.enqueue(encoder.encode(head));
      if (cut < bytes.byteLength) controller.enqueue(bytes.subarray(cut));
    },
    flush(controller) {
      // No `</head>` seen: emit what we held, unchanged.
      if (held.length > 0) controller.enqueue(concat(held));
    },
  });

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(response.body.pipeThrough(stream), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Every page (not `/api/*`) gets the boot script first. The homepage also inlines its
 * stylesheet (issue #229: it is the LCP page); other routes keep the
 * cacheable blocking link.
 */
export function withSsrHead(
  request: Request,
  response: Response,
  assets: AssetsFetcher | undefined
): Response {
  const path = new URL(request.url).pathname;
  // API responses are not pages. `/api/subscribe/preview` returns email
  // HTML, which must reach the preview iframe byte for byte.
  if (path === "/api" || path.startsWith("/api/")) return response;
  const sheets = path === "/" || path === "" ? assets : undefined;
  return rewriteHeadStream(response, async (head) => {
    const first = withBootScriptFirst(head);
    return sheets ? inlineStylesheets(first, sheets) : first;
  });
}
