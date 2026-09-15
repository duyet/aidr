import type { FeedItem } from "./types";

/** Canonical story permalink: /{8-char id prefix}. Category is UI-only. */
export function storyPath(item: Pick<FeedItem, "id">): string {
  return `/${item.id.slice(0, 8)}`;
}

/**
 * Extract the item id prefix from a story path segment: a bare hex id, or a
 * legacy `some-title-<hash>` slug (old URLs stay routable).
 */
export function idPrefixFromSlug(slug: string): string | null {
  if (/^[0-9a-f]{8,64}$/.test(slug)) return slug;
  const m = slug.match(/-([0-9a-f]{8,64})$/);
  return m ? m[1] : null;
}

/** Requested path for `/$slug`. */
export function requestedStoryPath(slug: string): string {
  return `/${slug}`;
}

/**
 * If the crawled URL is a duplicate (full hash, legacy title slug),
 * return the canonical `/{8-char}` path so Google indexes one URL.
 */
export function storyCanonicalRedirect(
  slug: string,
  item: Pick<FeedItem, "id">
): string | null {
  const canonical = storyPath(item);
  return requestedStoryPath(slug) === canonical ? null : canonical;
}

const RESERVED_TOP = new Set([
  "api",
  "sign-in",
  "sign-up",
  "assets",
  "cdn-cgi",
]);

/**
 * Permanent redirect target for old `/{category}/{slug}` (and over-long
 * single-segment hashes) → `/{8-char}`. Null if this path is not a story URL.
 */
export function legacyStoryRedirectPath(pathname: string): string | null {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 2) {
    const [cat, slug] = parts;
    if (RESERVED_TOP.has(cat)) return null;
    const prefix = idPrefixFromSlug(slug);
    if (!prefix) return null;
    return `/${prefix.slice(0, 8)}`;
  }
  if (parts.length === 1) {
    const prefix = idPrefixFromSlug(parts[0]);
    if (!prefix) return null;
    const canonical = `/${prefix.slice(0, 8)}`;
    return `/${parts[0]}` === canonical ? null : canonical;
  }
  return null;
}
