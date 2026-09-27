/**
 * Leaf module for the public read surface's byte/length bounds.
 *
 * These constants used to live in `public-queries.ts`, which drags the D1
 * query helpers (`getPublicDigest`, `loadTopStories`, the media manifest
 * parsers) with it. The agent read-tool contract needs the same numbers in
 * the **browser** (WebMCP tool results must be bounded by the identical
 * cap as `GET /api/public`) and in the Worker (anonymous MCP read tools),
 * and neither should have to import the query layer to read an integer.
 *
 * Keeping the values here — and re-exporting them from `public-queries.ts`
 * so every existing import path keeps working — guarantees there is exactly
 * ONE definition of each bound, so the MCP surface, the WebMCP surface, and
 * the REST API can never drift apart on size limits.
 */

/** Top stories on the public digest — keep the payload well under 50KB. */
export const PUBLIC_STORY_LIMIT = 8;
/** Snapshots store at most 16; cap again so a bloated row cannot balloon. */
export const PUBLIC_BULLET_CAP = 16;
/** Hard serialized-body budget for the unauthenticated public digest. */
export const PUBLIC_RESPONSE_MAX_BYTES = 50_000;
