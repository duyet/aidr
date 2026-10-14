/**
 * The one rewrite of a server-rendered page's <head>, done in the Worker on
 * the streamed response. Bytes are held until `</head>` arrives (it comes in
 * the first chunk), then the rest streams through untouched.
 */
import { URL_PRIVACY_BOOT_SCRIPT } from "./analytics/url-privacy";
import { type AssetsFetcher, inlineStylesheets } from "./inline-stylesheet";

const HEAD_START = /<head[\s>]/i;
const HEAD_END = "</head>";

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

function rewriteHeadStream(
  response: Response,
  rewrite: (head: string) => Promise<string>
): Response {
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.body || !type.includes("text/html")) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = "";
  let headDone = false;

  const stream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      if (headDone) {
        controller.enqueue(encoder.encode(text));
        return;
      }
      held += text;
      const end = held.indexOf(HEAD_END);
      if (end === -1) return;
      const cut = end + HEAD_END.length;
      headDone = true;
      const head = await rewrite(held.slice(0, cut));
      controller.enqueue(encoder.encode(head + held.slice(cut)));
      held = "";
    },
    flush(controller) {
      // No `</head>` seen: emit what we held, unchanged.
      held += decoder.decode();
      if (held) controller.enqueue(encoder.encode(held));
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
