/**
 * Versions with a release page, newest first. Kept apart from `index.ts` so
 * the sitemap and the route indexability gate (which every page's head
 * runs in the browser) do not pull the full release notes into the entry
 * preloads. `versions.test.ts` keeps this list equal to `RELEASES`.
 */
export const RELEASE_VERSIONS: readonly string[] = [
  "0.1.16",
  "0.1.13",
  "0.1.12",
  "0.1.0",
];

export function releasePathForVersion(version: string): string {
  return `/release/v${version}`;
}
