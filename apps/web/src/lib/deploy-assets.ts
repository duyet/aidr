/**
 * Keep earlier builds' hashed `/assets/*` servable after a deploy.
 *
 * Workers static assets serve only the current version's files, but HTML from
 * an earlier build lives on in the CDN and Worker caches (`s-maxage` plus
 * `stale-while-revalidate`), in browsers (`max-age`), and in open tabs that
 * lazy-load route chunks. Each deploy re-ships the files the live site still
 * lists in its asset history, so that HTML keeps hydrating (issue #702).
 */

/** Published at the site root by the assets binding, not by the Worker. */
export const ASSET_HISTORY_PATH = "asset-history.json";

/** How long a file stays servable after the last deploy that built it. */
export const ASSET_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Published path (`assets/index-abc.js`) → epoch ms of the last deploy that built it. */
export type AssetHistory = Readonly<Record<string, number>>;

const ASSET_PATH = /^assets\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Parse the live history file. Keys become write paths, so reject anything outside `assets/`. */
export function parseAssetHistory(raw: unknown): AssetHistory {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("asset history must be a JSON object");
  }
  const history: Record<string, number> = {};
  for (const [path, lastBuilt] of Object.entries(raw)) {
    if (!ASSET_PATH.test(path)) {
      throw new Error(`asset history has an invalid path: ${path}`);
    }
    if (typeof lastBuilt !== "number" || !Number.isFinite(lastBuilt)) {
      throw new Error(`asset history has an invalid time for ${path}`);
    }
    history[path] = lastBuilt;
  }
  return history;
}

export interface AssetCarryPlan {
  /** History to publish with the new build. */
  history: Record<string, number>;
  /** Live files the new build lacks and must re-ship. */
  carry: string[];
}

/**
 * The new build's files are stamped `now`. A live file the new build lacks
 * keeps its original time, so it expires `retentionMs` after the last deploy
 * that built it rather than living forever through re-carrying.
 */
export function planAssetCarry(
  current: readonly string[],
  live: AssetHistory,
  now: number,
  retentionMs: number = ASSET_RETENTION_MS
): AssetCarryPlan {
  const history: Record<string, number> = {};
  for (const path of current) {
    if (!ASSET_PATH.test(path)) {
      throw new Error(`build emitted an unsupported asset path: ${path}`);
    }
    history[path] = now;
  }
  const carry: string[] = [];
  for (const [path, lastBuilt] of Object.entries(live)) {
    if (path in history || now - lastBuilt >= retentionMs) continue;
    history[path] = lastBuilt;
    carry.push(path);
  }
  return { history, carry: carry.sort() };
}

/**
 * Canonical pages whose cached HTML a deploy must keep working: the English
 * home plus the first day and story page it links.
 */
export function deployCheckPages(homeHtml: string): string[] {
  const day = /href="(\/date\/\d{4}-\d{2}-\d{2}\?lang=en)"/.exec(homeHtml);
  const story = /href="(\/[0-9a-f]{8}\?lang=en)"/.exec(homeHtml);
  if (!day) throw new Error("home page links no day page");
  if (!story) throw new Error("home page links no story page");
  return ["/?lang=en", day[1], story[1]];
}

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
