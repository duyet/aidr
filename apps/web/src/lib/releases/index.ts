import { release as v0_1_0 } from "../../content/releases/v0.1.0";
import { release as v0_1_12 } from "../../content/releases/v0.1.12";
import { release as v0_1_13 } from "../../content/releases/v0.1.13";
import type { Release } from "./types";

/** Newest first. */
export const RELEASES: Release[] = [v0_1_13, v0_1_12, v0_1_0];

/** Accepts "v0.1.0" or "0.1.0". */
export function findRelease(version: string): Release | undefined {
  const bare = version.replace(/^v/, "");
  return RELEASES.find((r) => r.version === bare);
}

export function releasePath(release: Release): string {
  return `/release/v${release.version}`;
}
