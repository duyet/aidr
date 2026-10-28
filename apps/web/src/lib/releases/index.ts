import { release as v0_1_0 } from "../../content/releases/v0.1.0";
import { release as v0_1_12 } from "../../content/releases/v0.1.12";
import { release as v0_1_13 } from "../../content/releases/v0.1.13";
import { release as v0_1_16 } from "../../content/releases/v0.1.16";
import { release as v0_1_17 } from "../../content/releases/v0.1.17";
import { release as v0_1_18 } from "../../content/releases/v0.1.18";
import type { Release } from "./types";
import { releasePathForVersion } from "./versions";

export const RELEASES: Release[] = [
  v0_1_18,
  v0_1_17,
  v0_1_16,
  v0_1_13,
  v0_1_12,
  v0_1_0,
];

/** Accepts "v0.1.0" or "0.1.0". */
export function findRelease(version: string): Release | undefined {
  const bare = version.replace(/^v/, "");
  return RELEASES.find((r) => r.version === bare);
}

export function releasePath(release: Release): string {
  return releasePathForVersion(release.version);
}

/** Older and newer neighbours in `RELEASES` (newest first). */
export function releaseNeighbours(release: Release): {
  prev?: Release;
  next?: Release;
} {
  const i = RELEASES.findIndex((r) => r.version === release.version);
  return { prev: RELEASES[i + 1], next: RELEASES[i - 1] };
}
