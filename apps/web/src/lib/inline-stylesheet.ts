/**
 * Issue #229: on a slow link the LCP element waits for the render-blocking
 * stylesheet. The built sheet is ~18 KB gzip, so the homepage inlines the
 * whole of it in the head instead of a hand-written subset. The first paint
 * then uses the exact rules the page runs with, and nothing restyles after
 * load (a partial critical sheet did, #291: CLS 0.764).
 *
 * The sheet's hash is only known after the build, so the Worker reads the
 * built file from the ASSETS binding and rewrites the streamed head. Hashed
 * files never change, so each isolate fetches a given sheet once.
 */

type AssetsFetcher = { fetch: (request: Request) => Promise<Response> };

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const HEAD_END = "</head>";

const sheets = new Map<string, Promise<string | null>>();

/** Only same-origin, fingerprinted build output is safe to cache forever. */
function isBuiltSheet(href: string): boolean {
  return /^\/assets\/[^/?#]+\.css$/.test(href);
}

async function fetchSheet(
  assets: AssetsFetcher,
  href: string
): Promise<string | null> {
  // A synthetic request with `Accept: */*`: a forwarded browser navigation
  // would hit the SPA fallback and come back as index.html.
  const res = await assets.fetch(
    new Request(`https://assets.local${href}`, {
      method: "GET",
      headers: { Accept: "*/*" },
    })
  );
  const type = res.headers.get("Content-Type") ?? "";
  if (!res.ok || !type.includes("text/css")) return null;
  return res.text();
}

function loadSheet(
  assets: AssetsFetcher,
  href: string
): Promise<string | null> {
  let sheet = sheets.get(href);
  if (!sheet) {
    sheet = fetchSheet(assets, href).catch(() => null);
    // Keep hits and share in-flight fetches; drop misses so a later request
    // can retry.
    sheets.set(href, sheet);
    void sheet.then((css) => {
      if (css === null) sheets.delete(href);
    });
  }
  return sheet;
}

/** Test hook: forget cached sheets. */
export function clearInlinedSheets(): void {
  sheets.clear();
}

/**
 * Replace each built stylesheet link in `head` with a `<style>` holding the
 * same CSS. A link whose sheet cannot be read is left as it was.
 */
export async function inlineStylesheets(
  head: string,
  assets: AssetsFetcher
): Promise<string> {
  const links = [...head.matchAll(STYLESHEET_LINK)].map((m) => m[0]);
  let out = head;
  for (const tag of links) {
    const href = /\shref="([^"]*)"/.exec(tag)?.[1];
    if (!href || !isBuiltSheet(href)) continue;
    const css = await loadSheet(assets, href);
    // `</style` cannot occur in valid built CSS, but never let it end the tag.
    if (css === null || /<\/style/i.test(css)) continue;
    // Keep the link, switched off with `media="not all"`: React 19 manages
    // it as a stylesheet resource and re-inserts a missing one on hydrate.
    // A re-inserted sheet re-registers the @font-face rules after the fonts
    // are cached, so `font-display: optional` swaps them in and the page
    // shifts. A non-matching link does not block render or apply its rules.
    const off = tag.replace(/\s*\/?>$/, ' media="not all"/>');
    out = out.replace(tag, () => `<style>${css}</style>${off}`);
  }
  return out;
}

/**
 * Rewrite only the `<head>` of a streamed HTML response. Bytes are held until
 * `</head>` arrives (it comes in the first chunk), then the rest streams
 * through untouched.
 */
export function withInlineStylesheets(
  response: Response,
  assets: AssetsFetcher
): Response {
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.body || !type.includes("text/html")) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let held = "";
  let headDone = false;

  const rewrite = new TransformStream<Uint8Array, Uint8Array>({
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
      const head = await inlineStylesheets(held.slice(0, cut), assets);
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
  return new Response(response.body.pipeThrough(rewrite), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Homepage only: it is the LCP page issue #229 tracks. Other routes keep the
 * cacheable blocking link.
 */
export function withHomepageInlineStylesheets(
  request: Request,
  response: Response,
  assets: AssetsFetcher | undefined
): Response {
  if (!assets) return response;
  const path = new URL(request.url).pathname;
  if (path !== "/" && path !== "") return response;
  return withInlineStylesheets(response, assets);
}
