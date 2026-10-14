/** Every distinct `/assets/*` URL path an HTML document references. */
export function assetRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const match of html.matchAll(
    /\/assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*/g
  )) {
    refs.add(match[0]);
  }
  return [...refs].sort();
}
