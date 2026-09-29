/** Unhashed files copied from apps/web/public into dist/client. */

export const PUBLIC_ASSET_PATHS = new Set([
  "/logo-sm.png",
  "/logo.png",
  "/logo-icon.png",
  "/logo.svg",
  "/og.jpg",
  "/favicon.svg",
  "/favicon.ico",
  "/favicon-120x120.png",
  "/apple-touch-icon.png",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

export function isPublicAssetPath(pathname: string): boolean {
  return PUBLIC_ASSET_PATHS.has(pathname);
}

export function publicAssetContentType(pathname: string): string | undefined {
  const dot = pathname.lastIndexOf(".");
  if (dot < 0) return undefined;
  return MIME_BY_EXT[pathname.slice(dot).toLowerCase()];
}

type AssetEnv = { ASSETS?: { fetch: (request: Request) => Promise<Response> } };

function assetsGet(path: string): Request {
  // Do not forward the browser request. SPA not_found_handling treats
  // Accept: text/html (and some GETs) as navigation and returns index.html.
  return new Request(`https://assets.local${path}`, {
    method: "GET",
    headers: { Accept: "*/*" },
  });
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  // Skip anything legal before the root element: a UTF-8 BOM, whitespace, the
  // XML declaration, a DOCTYPE, and comments. The shipped marks carry an
  // explanatory comment, so a naive `startsWith("<svg")` sniff would miss them
  // and mislabel a real SVG as a miss.
  let text = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 512))
    .replace(/^\uFEFF/, "")
    .trimStart();
  for (let i = 0; i < 8 && text.length > 0; i += 1) {
    if (text.startsWith("<svg")) return true;
    if (text.startsWith("<?xml") || text.startsWith("<!DOCTYPE")) {
      const close = text.indexOf(">");
      if (close < 0) return false;
      text = text.slice(close + 1).trimStart();
      continue;
    }
    if (text.startsWith("<!--")) {
      const close = text.indexOf("-->");
      if (close < 0) return false;
      text = text.slice(close + 3).trimStart();
      continue;
    }
    return false;
  }
  return false;
}

/**
 * Serve a real public file from the assets binding. SPA not_found_handling
 * returns text/html for misses — reject that so mail never embeds a shell.
 */
export async function handlePublicAsset(
  request: Request,
  env: AssetEnv
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!isPublicAssetPath(path)) return null;
  if (!env.ASSETS) return null;
  const res = await env.ASSETS.fetch(assetsGet(path));
  const body = new Uint8Array(await res.arrayBuffer());
  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  const svg = looksLikeSvg(body);
  if (!res.ok || (ctype.includes("text/html") && !svg)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const headers = new Headers(res.headers);
  const mime = svg ? "image/svg+xml" : publicAssetContentType(path);
  if (mime) headers.set("Content-Type", mime);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=86400");
  }
  return new Response(body, { status: res.status, headers });
}
