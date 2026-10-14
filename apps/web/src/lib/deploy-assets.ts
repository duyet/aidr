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

const ASSET_NAME = "[A-Za-z0-9_-][A-Za-z0-9._-]*";
const ASSET_PATH = new RegExp(`^assets/${ASSET_NAME}$`);

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

/**
 * Every distinct `/assets/*` URL path an HTML document references on `origin`.
 * A reference starts after a quote, `=` or `(`, either root-relative or
 * absolute on `origin`, and names a single build-output file. Third-party
 * URLs that happen to contain `/assets/` (story images) are not ours to check.
 */
export function assetRefs(html: string, origin: string): string[] {
  const ownOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<=["'=(])(?:${ownOrigin})?(/assets/${ASSET_NAME})(?![A-Za-z0-9._/-])`,
    "g"
  );
  const refs = new Set<string>();
  for (const match of html.matchAll(pattern)) refs.add(match[1]);
  return [...refs].sort();
}

/** Per-request limit, so a hung live site can't stall a deploy. */
export const REQUEST_TIMEOUT_MS = 15_000;

export function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

type Get = (url: string, init?: RequestInit) => Promise<Response>;

const ATTEMPTS = 3;
const CONCURRENCY = 8;

async function html(get: Get, url: string): Promise<string> {
  const res = await get(url, { headers: { accept: "text/html" } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Without a history file (the first deploy with one, or a deploy that skipped
 * the carry step) fall back to what the cached pages the post-deploy smoke
 * checks load right now, plus the Vietnamese home.
 */
async function seedFromCachedPages(
  get: Get,
  base: string,
  now: number
): Promise<LiveHistory> {
  const pages = [
    ...deployCheckPages(await html(get, `${base}/?lang=en`)),
    "/?lang=vi",
  ];
  const seed: Record<string, number> = {};
  for (const page of pages) {
    for (const ref of assetRefs(await html(get, `${base}${page}`), base)) {
      seed[ref.slice(1)] = now;
    }
  }
  return { kind: "seeded", history: parseAssetHistory(seed), pages };
}

type LiveHistory =
  | { kind: "published"; history: AssetHistory }
  | { kind: "seeded"; history: AssetHistory; pages: readonly string[] }
  | { kind: "unreadable"; reason: string };

function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  return e.cause instanceof Error
    ? `${e.message} (${e.cause.message})`
    : e.message;
}

async function readLiveHistory(
  get: Get,
  base: string,
  now: number
): Promise<LiveHistory> {
  try {
    const res = await get(`${base}/${ASSET_HISTORY_PATH}?t=${now}`, {
      headers: { "cache-control": "no-cache" },
    });
    if (res.status === 404) return await seedFromCachedPages(get, base, now);
    if (!res.ok) {
      throw new Error(`GET ${ASSET_HISTORY_PATH} -> HTTP ${res.status}`);
    }
    return {
      kind: "published",
      history: parseAssetHistory(await res.json()),
    };
  } catch (e) {
    return { kind: "unreadable", reason: describeError(e) };
  }
}

/** The history to carry from. Never throws: see `carryLiveAssets`. */
async function liveHistory(
  get: Get,
  base: string,
  now: number,
  warn: (message: string) => void
): Promise<AssetHistory> {
  const live = await readLiveHistory(get, base, now);
  switch (live.kind) {
    case "published":
      return live.history;
    case "seeded":
      warn(
        `${base}/${ASSET_HISTORY_PATH} not found; seeded from ${live.pages.join(", ")}`
      );
      return live.history;
    case "unreadable":
      warn(
        `could not read the live site (${live.reason}); deploying without carrying earlier assets, so HTML cached from earlier builds may load missing chunks until it expires`
      );
      return {};
  }
}

async function download(
  get: Get,
  sleep: (ms: number) => Promise<void>,
  base: string,
  path: string
): Promise<Uint8Array> {
  let reason = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await get(`${base}/${path}`);
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && !type.startsWith("text/html")) {
        return new Uint8Array(await res.arrayBuffer());
      }
      reason = `HTTP ${res.status} ${type}`;
    } catch (e) {
      reason = describeError(e);
    }
    if (attempt < ATTEMPTS) await sleep(attempt * 1000);
  }
  throw new Error(`GET /${path} failed after ${ATTEMPTS} attempts: ${reason}`);
}

export interface CarryOptions {
  /** Live site origin, e.g. `https://aidr.today`. */
  base: string;
  /** Asset paths the new build emitted (`assets/index-abc.js`). */
  built: readonly string[];
  now: number;
  /** Writes one carried file into the build output. */
  save: (path: string, bytes: Uint8Array) => void;
  warn: (message: string) => void;
  timeoutMs?: number;
  /** Waits between download attempts. */
  sleep?: (ms: number) => Promise<void>;
}

export interface CarryResult {
  /** History to publish with the new build. */
  history: Record<string, number>;
  carried: number;
  attempted: number;
}

/**
 * Re-ship the live site's still-retained files the new build lacks. A file
 * that fails to download is warned about and dropped from the history.
 *
 * When the live site can't be read at all, this warns and plans from an empty
 * history rather than throwing: the deploy it runs in may be the one meant to
 * fix that site. The published history then lists only the new build, so the
 * next deploy carries normally.
 */
export async function carryLiveAssets(
  options: CarryOptions
): Promise<CarryResult> {
  const { base, now, save, warn } = options;
  const get: Get = (url, init) => timedFetch(url, init, options.timeoutMs);
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const plan = planAssetCarry(
    options.built,
    await liveHistory(get, base, now, warn),
    now
  );

  const failed: string[] = [];
  const queue = [...plan.carry];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let path = queue.shift(); path; path = queue.shift()) {
        try {
          save(path, await download(get, sleep, base, path));
        } catch (e) {
          failed.push(path);
          warn(`not carried: ${(e as Error).message}`);
        }
      }
    })
  );
  for (const path of failed) delete plan.history[path];
  return {
    history: plan.history,
    carried: plan.carry.length - failed.length,
    attempted: plan.carry.length,
  };
}
