/**
 * Keep earlier builds' hashed `/assets/*` servable after a deploy.
 *
 * Workers static assets serve only the current version's files, but HTML from
 * an earlier build lives on in the CDN and Worker caches (`s-maxage` plus
 * `stale-while-revalidate`), in browsers (`max-age`), and in open tabs that
 * lazy-load route chunks. Each deploy re-ships the files the live site still
 * lists in its asset history, so that HTML keeps hydrating (issue #702).
 */
import { readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Published at the site root by the assets binding, not by the Worker. */
export const ASSET_HISTORY_PATH = "asset-history.json";

/**
 * How long a file stays servable after the last build that emitted it was
 * replaced. `html-cache.test.ts` holds every HTML cache policy under it.
 */
export const ASSET_RETENTION_MS = 48 * 60 * 60 * 1000;

/**
 * Retention runs from the deploy that replaced a file's last build, not the
 * one that built it: a build that stays live for a day renders HTML naming
 * its files until the moment it is replaced.
 */
export interface AssetHistory {
  /** The live build's own files (`assets/index-abc.js`). */
  readonly built: readonly string[];
  /** Earlier builds' files → epoch ms of the deploy that replaced the last build emitting them. */
  readonly retired: Readonly<Record<string, number>>;
}

const ASSET_NAME = "[A-Za-z0-9_-][A-Za-z0-9._-]*";
const ASSET_PATH = new RegExp(`^assets/${ASSET_NAME}$`);

function assertAssetPaths(paths: readonly string[], source: string): void {
  const invalid = paths.filter((path) => !ASSET_PATH.test(path));
  if (invalid.length > 0) {
    throw new Error(
      `${source} has unsupported asset path(s): ${invalid.join(", ")}`
    );
  }
}

/**
 * The new build's `/assets/*` files. Both the carry step and the PR gate
 * (`assert-deploy-artifact.ts`) read the build through this, so a file the
 * carry could not publish fails a pull request rather than the deploy.
 *
 * `vite build` empties `dist/client`, so a history file there means the
 * output was carried into and not rebuilt since; its carried files would
 * otherwise be read as this build's own.
 */
export function readBuildAssets(clientRoot: string): string[] {
  if (readdirSync(clientRoot).includes(ASSET_HISTORY_PATH)) {
    throw new Error(
      `${clientRoot} already holds ${ASSET_HISTORY_PATH} from an earlier carry; rebuild first`
    );
  }
  const paths = readdirSync(join(clientRoot, "assets"), {
    withFileTypes: true,
  }).map((entry) => `assets/${entry.name}${entry.isFile() ? "" : "/"}`);
  assertAssetPaths(paths, "the build");
  return paths.sort();
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/**
 * Parse the live history file. Its paths become write paths, so reject
 * anything outside `assets/`. A time after `now`, from a deploy machine with a
 * fast clock, reads as `now`; kept as is, it would outlive retention.
 */
export function parseAssetHistory(raw: unknown, now: number): AssetHistory {
  if (!(isRecord(raw) && Array.isArray(raw.built) && isRecord(raw.retired))) {
    throw new Error("asset history must be { built: [...], retired: {...} }");
  }
  const built = raw.built.map(String);
  assertAssetPaths([...built, ...Object.keys(raw.retired)], "asset history");
  const retired: Record<string, number> = {};
  for (const [path, replacedAt] of Object.entries(raw.retired)) {
    if (typeof replacedAt !== "number" || !Number.isFinite(replacedAt)) {
      throw new Error(`asset history has an invalid time for ${path}`);
    }
    retired[path] = Math.min(replacedAt, now);
  }
  return { built, retired };
}

export interface AssetCarryPlan {
  /** History to publish with the new build. */
  history: { built: string[]; retired: Record<string, number> };
  /** Live files the new build lacks and must re-ship. */
  carry: string[];
}

/**
 * The live build's files that the new build lacks retire `now`. Files that
 * retired earlier keep their time, so re-carrying never extends them.
 *
 * `carry` lists the newest retired files first, ties by path. The download
 * step can hit its deadline, and the build just replaced is the one whose
 * HTML is most likely still cached, so it goes before 47-hour-old files.
 */
export function planAssetCarry(
  current: readonly string[],
  live: AssetHistory,
  now: number,
  retentionMs: number = ASSET_RETENTION_MS
): AssetCarryPlan {
  assertAssetPaths(current, "the build");
  const building = new Set(current);
  const retired: Record<string, number> = {};
  for (const [path, replacedAt] of Object.entries(live.retired)) {
    if (building.has(path) || now - replacedAt >= retentionMs) continue;
    retired[path] = replacedAt;
  }
  for (const path of live.built) {
    if (!building.has(path)) retired[path] = now;
  }
  return {
    history: { built: [...building].sort(), retired },
    carry: Object.keys(retired).sort(
      (a, b) => retired[b] - retired[a] || (a < b ? -1 : a > b ? 1 : 0)
    ),
  };
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

/** Largest file carried; the live site's biggest chunk is about 0.5 MB. */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

const JAVASCRIPT = /^(text|application)\/(x-)?javascript$/;
const FONT = /^(font\/|application\/(x-)?font-)/;
const IMAGE = /^image\//;

/** Media types a carried file may be served as, by file extension. */
const MEDIA_TYPES = new Map<string, RegExp>([
  ["js", JAVASCRIPT],
  ["css", /^text\/css$/],
  ["woff2", FONT],
  ["woff", FONT],
  ["ttf", FONT],
  ["otf", FONT],
  ["png", IMAGE],
  ["jpg", IMAGE],
  ["jpeg", IMAGE],
  ["gif", IMAGE],
  ["webp", IMAGE],
  ["avif", IMAGE],
  ["ico", IMAGE],
  ["svg", /^image\/svg\+xml$/],
]);

const NO_MEDIA_TYPE = "no expected content type for this file extension";

function expectedMediaType(path: string): RegExp | undefined {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? undefined : MEDIA_TYPES.get(path.slice(dot + 1));
}

/**
 * Build files the carry would refuse for their extension. `assetBodyProblem`
 * drops them after the deploy, so a new output type (`.map`, `.wasm`, `.json`)
 * must fail the PR gate instead.
 */
export function uncarriableAssets(paths: readonly string[]): string[] {
  return paths.filter((path) => !expectedMediaType(path));
}

/**
 * Why a downloaded body can't be published as `path`, or null when it can.
 * A carried file is served under its hashed name to every cached page that
 * asks, so it must be the kind of file that name promises.
 */
export function assetBodyProblem(
  path: string,
  contentType: string,
  byteLength: number
): string | null {
  const expected = expectedMediaType(path);
  if (!expected) return NO_MEDIA_TYPE;
  const media = contentType.split(";")[0].trim().toLowerCase();
  if (!expected.test(media)) {
    return `content-type ${media || "(none)"} does not match the extension`;
  }
  if (byteLength > MAX_ASSET_BYTES) {
    return `${byteLength} bytes is over the ${MAX_ASSET_BYTES}-byte cap`;
  }
  return null;
}

/** Per-request limit, so a hung live site can't stall a deploy. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Limit on the whole carry step; after it the deploy goes on with what it has. */
export const CARRY_DEADLINE_MS = 5 * 60 * 1000;

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
 * checks load right now, plus the Vietnamese home, as the live build's files.
 */
async function seedFromCachedPages(
  get: Get,
  base: string
): Promise<LiveHistory> {
  const pages = [
    ...deployCheckPages(await html(get, `${base}/?lang=en`)),
    "/?lang=vi",
  ];
  const built = new Set<string>();
  for (const page of pages) {
    for (const ref of assetRefs(await html(get, `${base}${page}`), base)) {
      built.add(ref.slice(1));
    }
  }
  return { kind: "seeded", history: { built: [...built], retired: {} }, pages };
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
    if (res.status === 404) return await seedFromCachedPages(get, base);
    if (!res.ok) {
      throw new Error(`GET ${ASSET_HISTORY_PATH} -> HTTP ${res.status}`);
    }
    return {
      kind: "published",
      history: parseAssetHistory(await res.json(), now),
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
      return { built: [], retired: {} };
  }
}

/**
 * `refused`: the site answered and the file can't be carried, so it leaves the
 * history. `failed`: the cause may be passing, so the file stays listed for the
 * next deploy to try until it expires.
 */
type AssetFetch =
  | { kind: "ok"; bytes: Uint8Array }
  | { kind: "refused"; reason: string }
  | { kind: "failed"; reason: string };

async function download(
  get: Get,
  sleep: (ms: number) => Promise<void>,
  msLeft: () => number,
  base: string,
  path: string
): Promise<AssetFetch> {
  let result: AssetFetch = { kind: "failed", reason: "carry deadline reached" };
  for (let attempt = 1; attempt <= ATTEMPTS && msLeft() > 0; attempt++) {
    if (attempt > 1) await sleep(Math.min((attempt - 1) * 1000, msLeft()));
    result = await fetchAsset(get, base, path);
    if (result.kind !== "failed") return result;
  }
  return result;
}

async function fetchAsset(
  get: Get,
  base: string,
  path: string
): Promise<AssetFetch> {
  try {
    const res = await get(`${base}/${path}`);
    if (!res.ok) {
      await res.body?.cancel();
      const kind =
        res.status === 404 || res.status === 410 ? "refused" : "failed";
      return { kind, reason: `HTTP ${res.status}` };
    }
    const type = res.headers.get("content-type") ?? "";
    const declared = Number(res.headers.get("content-length") ?? 0);
    const early = assetBodyProblem(path, type, declared);
    if (early) {
      await res.body?.cancel();
      return { kind: "refused", reason: early };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const problem = assetBodyProblem(path, type, bytes.byteLength);
    return problem
      ? { kind: "refused", reason: problem }
      : { kind: "ok", bytes };
  } catch (e) {
    return { kind: "failed", reason: describeError(e) };
  }
}

/**
 * Write a carried file under its hashed name only once all of it is on disk:
 * a partial file under that name would be published and served as the chunk.
 */
export function writeCarriedAsset(
  clientRoot: string,
  path: string,
  bytes: Uint8Array,
  write: (file: string, bytes: Uint8Array) => void = writeFileSync
): void {
  const out = join(clientRoot, path);
  const partial = `${out}.partial`;
  try {
    write(partial, bytes);
    renameSync(partial, out);
  } catch (e) {
    rmSync(partial, { force: true });
    throw e;
  }
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
  /** Limit on the whole step, history read included. */
  deadlineMs?: number;
  /** Waits between download attempts. */
  sleep?: (ms: number) => Promise<void>;
}

export interface CarryResult {
  /** History to publish with the new build. */
  history: AssetCarryPlan["history"];
  carried: number;
  attempted: number;
}

/**
 * Re-ship the live site's still-retained files the new build lacks.
 *
 * The live site never fails the deploy this runs in, which may be the one
 * meant to fix that site: an unreadable site plans from an empty history, and
 * the step stops downloading at `deadlineMs` and publishes what it has. Only
 * this build's own output (`planAssetCarry`) can throw.
 */
export async function carryLiveAssets(
  options: CarryOptions
): Promise<CarryResult> {
  const { base, now, save, warn } = options;
  const deadlineMs = options.deadlineMs ?? CARRY_DEADLINE_MS;
  const deadlineAt = Date.now() + deadlineMs;
  const msLeft = () => deadlineAt - Date.now();
  const get: Get = (url, init) =>
    timedFetch(
      url,
      init,
      Math.max(0, Math.min(options.timeoutMs ?? REQUEST_TIMEOUT_MS, msLeft()))
    );
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const plan = planAssetCarry(
    options.built,
    await liveHistory(get, base, now, warn),
    now
  );

  let carried = 0;
  const queue = [...plan.carry];
  const drop = (path: string, reason: string) => {
    delete plan.history.retired[path];
    warn(`not carried: /${path}: ${reason}`);
  };
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0 && msLeft() > 0) {
        const path = queue.shift() as string;
        const fetched = await download(get, sleep, msLeft, base, path);
        if (fetched.kind === "refused") {
          drop(path, fetched.reason);
        } else if (fetched.kind === "failed") {
          warn(
            `not carried this deploy, kept in the history: /${path}: ${fetched.reason}`
          );
        } else {
          try {
            save(path, fetched.bytes);
            carried++;
          } catch (e) {
            drop(path, `could not write it: ${describeError(e)}`);
          }
        }
      }
    })
  );
  if (queue.length > 0) {
    warn(
      `stopped carrying at the ${deadlineMs / 1000}s deadline; ${queue.length} file(s) not tried stay in the history`
    );
  }
  return { history: plan.history, carried, attempted: plan.carry.length };
}
