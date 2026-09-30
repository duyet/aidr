import criticalCssSource from "../critical.css?raw";

/**
 * Issue #229: the LCP element render delay is dominated by the
 * render-blocking stylesheet on a slow link. The fix is the standard one:
 * inline the CSS the first paint needs, and load the full sheet without
 * blocking render.
 *
 * TanStack Start emits a hashed `<link rel="stylesheet">` into the SSR head.
 * The hash is only known after the build, so this works on the response:
 * the head is rewritten once, then the rest of the body streams untouched.
 */

/** `src/critical.css` with comments and whitespace removed. */
export const CRITICAL_CSS = criticalCssSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .join(" ")
  .replace(/\s*([{};:,>])\s*/g, "$1");

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const HEAD_END = "</head>";

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/**
 * Turn each same-origin stylesheet link into a non-blocking preload that
 * flips to a stylesheet on load, with a `<noscript>` fallback. Inline the
 * critical CSS ahead of the first one. Heads with no stylesheet link (dev
 * server, error pages) are returned unchanged.
 */
export function inlineCriticalCss(head: string): string {
  let inlined = false;
  return head.replace(STYLESHEET_LINK, (tag) => {
    const href = attr(tag, "href");
    if (!href?.startsWith("/") || href.startsWith("//")) return tag;
    const crossorigin = attr(tag, "crossorigin");
    const cors =
      crossorigin === undefined ? "" : ` crossorigin="${crossorigin}"`;
    const style = inlined
      ? ""
      : `<style data-critical-css>${CRITICAL_CSS}</style>`;
    inlined = true;
    return (
      `${style}<link rel="preload" as="style" href="${href}"${cors}` +
      ` onload="this.onload=null;this.rel='stylesheet'"/>` +
      `<noscript><link rel="stylesheet" href="${href}"${cors}/></noscript>`
    );
  });
}

/**
 * Rewrite only the `<head>` of a streamed HTML response. Bytes are held until
 * `</head>` arrives (the head is a few KB and comes in the first chunk), then
 * everything after it is passed through as it streams.
 */
export function withCriticalCss(response: Response): Response {
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.body || !type.includes("text/html")) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = "";
  let headDone = false;

  const rewrite = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
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
      controller.enqueue(
        encoder.encode(inlineCriticalCss(held.slice(0, cut)) + held.slice(cut))
      );
      held = "";
    },
    flush(controller) {
      // No `</head>` seen: emit what we held, unchanged.
      if (held) controller.enqueue(encoder.encode(held));
    },
  });

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(response.body.pipeThrough(rewrite), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The critical CSS only covers the homepage's first screen (header shell and
 * the AI;DR section). Other routes keep the blocking stylesheet so that a
 * page with markup the critical CSS does not know about cannot shift.
 */
export function withHomepageCriticalCss(
  request: Request,
  response: Response
): Response {
  const path = new URL(request.url).pathname;
  if (path !== "/" && path !== "") return response;
  return withCriticalCss(response);
}
