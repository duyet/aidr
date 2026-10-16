/**
 * KV copy of the Worker cache's homepage entry (`edge-cache.ts`), so a colo
 * with an empty cache serves another colo's render instead of rendering.
 * The value is the stored entry itself: one line of JSON headers, then the
 * HTML. Keys carry the deployed version id, so a copy never names another
 * build's chunks.
 */
import { EDGE_CACHE_STALE_S } from "./edge-cache-window";

/**
 * Least age a KV copy must reach before a render may replace it. Four keys
 * at one write per 10 minutes stay under the Free plan's 1,000 writes a day.
 */
export const GLOBAL_WRITE_INTERVAL_S = 600;

/** A stored entry readable from every colo. Same shape as the Worker cache's. */
export interface GlobalHtmlCache {
  /** The stored copy, or null when absent, expired, or the read failed. */
  get(key: Request): Promise<Response | null>;
  /** Store the entry under this build's key. Never throws. */
  put(key: Request, stored: Response, fresh: number): Promise<void>;
}

interface GlobalHtmlCacheEnv {
  HTML_CACHE?: KVNamespace;
  CF_VERSION_METADATA?: { id: string };
}

const LOCALE_KEY_PARAMS = new Set(["lang", "__l"]);

/**
 * Keys whose entries are shared across colos: the homepage in one language,
 * with no filter. `?q=` and other params would make the key count, and so
 * the KV writes, unbounded.
 */
export function isGloballyCachedKey(key: Request): boolean {
  const url = new URL(key.url);
  if (url.pathname !== "/") return false;
  const names = [...url.searchParams.keys()];
  return (
    names.length === 2 &&
    names.includes("__v") &&
    names.some((name) => LOCALE_KEY_PARAMS.has(name))
  );
}

/** Null when the KV binding or the version id is absent: the tier is off. */
export function globalHtmlCache(
  env: GlobalHtmlCacheEnv
): GlobalHtmlCache | null {
  const kv = env.HTML_CACHE;
  const version = env.CF_VERSION_METADATA?.id;
  if (!(kv && version)) return null;
  const kvKey = (key: Request) => `${version}:${key.url}`;
  return {
    async get(key) {
      try {
        const value = await kv.get(kvKey(key), "text");
        const split = value?.indexOf("\n") ?? -1;
        if (!value || split === -1) return null;
        const { headers } = JSON.parse(value.slice(0, split)) as {
          headers: [string, string][];
        };
        return new Response(value.slice(split + 1), { headers });
      } catch {
        return null;
      }
    },
    async put(key, stored, fresh) {
      try {
        const head = JSON.stringify({ headers: [...stored.headers] });
        await kv.put(kvKey(key), `${head}\n${await stored.text()}`, {
          expirationTtl: fresh + EDGE_CACHE_STALE_S,
        });
      } catch {
        // The local cache already holds this render.
      }
    },
  };
}
