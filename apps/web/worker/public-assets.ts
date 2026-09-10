/** Unhashed files copied from apps/web/public into dist/client. */

export const PUBLIC_ASSET_PATHS = new Set([
  "/logo-sm.png",
  "/logo.png",
  "/logo-icon.png",
  "/logo.svg",
  "/og.jpg",
  "/favicon.svg",
]);

export function isPublicAssetPath(pathname: string): boolean {
  return PUBLIC_ASSET_PATHS.has(pathname);
}

type AssetEnv = { ASSETS?: { fetch: (request: Request) => Promise<Response> } };

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
  const res = await env.ASSETS.fetch(request);
  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!res.ok || ctype.includes("text/html")) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const headers = new Headers(res.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=86400");
  }
  return new Response(res.body, { status: res.status, headers });
}
