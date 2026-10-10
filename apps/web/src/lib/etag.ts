/**
 * Conditional GET for JSON APIs that only change once per 30-minute edition
 * (/api/feed, /api/public). Polling clients such as the Chrome extension send
 * `If-None-Match` and get an empty 304 instead of the full body; the edge
 * cache can answer revalidations the same way.
 *
 * The tag is a weak SHA-256 of the body, so it changes exactly when the bytes
 * the client would receive change. Only 200 responses get a tag.
 */
export async function withEtag(
  request: Request,
  response: Response
): Promise<Response> {
  if (response.status !== 200 || request.method !== "GET") return response;
  const body = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body));
  let hex = "";
  for (const byte of digest.subarray(0, 16)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  const etag = `W/"${hex}"`;
  const headers = new Headers(response.headers);
  headers.set("ETag", etag);
  if (ifNoneMatchHits(request.headers.get("If-None-Match"), etag)) {
    headers.delete("Content-Length");
    headers.delete("Content-Type");
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

function ifNoneMatchHits(header: string | null, etag: string): boolean {
  if (!header) return false;
  const opaque = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((tag) => tag.trim())
    .some((tag) => tag === "*" || tag.replace(/^W\//, "") === opaque);
}
