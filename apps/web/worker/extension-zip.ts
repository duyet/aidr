import { EXTENSION_VERSION } from "../src/lib/extension-release";

/**
 * Resolve the latest Chrome-extension GitHub release (tags `aidr-v*`) and
 * its Load-unpacked zip asset. Used so https://aidr.today/aidr.zip always
 * tracks the newest extension release, not whatever was last Worker-deployed.
 */

export const AIDR_GITHUB_REPO = "duyet/aidr";
export const AIDR_RELEASE_TAG_PREFIX = "aidr-v";
export const AIDR_ZIP_ASSET_NAME = "aidr.zip";

const GITHUB_RELEASES_URL = `https://api.github.com/repos/${AIDR_GITHUB_REPO}/releases?per_page=20`;

export type LatestAidrRelease = {
  version: string;
  tag: string;
  zipUrl: string;
};

type GhRelease = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
};

let memoryCache: { at: number; value: LatestAidrRelease | null } | null = null;
const MEMORY_TTL_MS = 5 * 60 * 1000;

export function versionFromAidrTag(tag: string): string | null {
  const match = tag.trim().match(/^aidr-v(\d+\.\d+\.\d+)\b/);
  return match ? match[1] : null;
}

export function aidrZipDownloadUrl(version: string): string {
  return `https://github.com/${AIDR_GITHUB_REPO}/releases/download/${AIDR_RELEASE_TAG_PREFIX}${version}/${AIDR_ZIP_ASSET_NAME}`;
}

export function pickLatestAidrRelease(
  releases: GhRelease[]
): LatestAidrRelease | null {
  const candidates: LatestAidrRelease[] = [];
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const tag = release.tag_name?.trim() ?? "";
    const version = versionFromAidrTag(tag);
    if (!version) continue;
    const asset = (release.assets ?? []).find(
      (a) => a.name === AIDR_ZIP_ASSET_NAME && a.browser_download_url
    );
    if (!asset?.browser_download_url) continue;
    candidates.push({
      version,
      tag,
      zipUrl: asset.browser_download_url,
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => compareSemver(b.version, a.version));
  return candidates[0];
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export async function fetchLatestAidrRelease(
  fetchImpl: typeof fetch = fetch
): Promise<LatestAidrRelease | null> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.at < MEMORY_TTL_MS) {
    return memoryCache.value;
  }
  const res = await fetchImpl(GITHUB_RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "aidr.today-extension-zip",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    // Avoid Workers Cache retaining a rate-limited/error body.
    cf: { cacheTtl: 0, cacheEverything: false },
  } as RequestInit);
  if (!res.ok) {
    // Do not cache failures — a brief GitHub blip must not 502 /aidr.zip.
    return null;
  }
  const body = (await res.json()) as GhRelease[];
  const latest = Array.isArray(body) ? pickLatestAidrRelease(body) : null;
  if (latest) {
    memoryCache = { at: now, value: latest };
  }
  return latest;
}

/** Test helper — clear the in-isolate memo. */
export function clearLatestAidrReleaseCache(): void {
  memoryCache = null;
}

function zipRedirect(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Prefer the newest GitHub release that ships `aidr.zip`. If the API is
 * unreachable (rate limit), fall back to the shipped EXTENSION_VERSION asset
 * URL — never call env.ASSETS for this path (run_worker_first would loop).
 */
export async function handleAidrZipRequest(
  request: Request,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const latest = await fetchLatestAidrRelease(fetchImpl);
  if (latest) {
    return zipRedirect(latest.zipUrl);
  }
  return zipRedirect(aidrZipDownloadUrl(EXTENSION_VERSION));
}
