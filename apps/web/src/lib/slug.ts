import type { FeedItem } from "./types";

/** /ai/abc12345 style path for a story — category + 8-char id prefix. */
export function storyPath(item: Pick<FeedItem, "id" | "category">): string {
  const cat = (item.category ?? "ai").toLowerCase();
  return `/${cat}/${item.id.slice(0, 8)}`;
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

/** Requested path for `/$cat/$slug`. */
export function requestedStoryPath(cat: string, slug: string): string {
  return `/${cat}/${slug}`;
}

/**
 * If the crawled URL is a duplicate (full hash, /ai/ prefix, legacy slug),
 * return the canonical `/{category}/{8-char}` path so Google indexes one URL.
 */
export function storyCanonicalRedirect(
  cat: string,
  slug: string,
  item: Pick<FeedItem, "id" | "category">
): string | null {
  const canonical = storyPath(item);
  return requestedStoryPath(cat, slug) === canonical ? null : canonical;
}
