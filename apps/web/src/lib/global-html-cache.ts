/**
 * R2 copy of the Worker cache's homepage entry (`edge-cache.ts`), so a colo
 * with an empty cache serves another colo's render instead of rendering.
 * The object body is the stored entry itself: one line of JSON headers, then
 * the HTML. There is one object per cache key under `html/`, overwritten in
 * place, so nothing accumulates. Its custom metadata carries the deployed
 * version id and an expiry; a copy is read only when both still hold, so it
 * never names another build's chunks.
 */
import { EDGE_CACHE_STALE_S } from "./edge-cache-window";

/**
 * Least age a KV copy must reach before a render may replace it. Four keys
 * at one write per 10 minutes stay under the Free plan's 1,000 writes a day.
 */
export const GLOBAL_WRITE_INTERVAL_S = 600;

export interface GlobalHtmlCache {
  get(key: Request): Promise<Response | null>;
  put(key: Request, stored: Response, fresh: number): Promise<void>;
}

interface GlobalHtmlCacheEnv {
  OG_CACHE?: R2Bucket;
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

/** Prefix of every object this tier writes to the shared bucket. */
const KEY_PREFIX = "html/";

export function globalHtmlCache(
  env: GlobalHtmlCacheEnv
): GlobalHtmlCache | null {
  const bucket = env.OG_CACHE;
  const version = env.CF_VERSION_METADATA?.id;
  if (!(bucket && version)) return null;
  const objectKey = (key: Request) =>
    `${KEY_PREFIX}${encodeURIComponent(key.url)}`;
  const nowS = () => Math.floor(Date.now() / 1000);
  return {
    async get(key) {
      try {
        const object = await bucket.get(objectKey(key));
        const meta = object?.customMetadata;
        if (!(object && meta)) return null;
        if (meta.version !== version || Number(meta.expiresAt) <= nowS()) {
          return null;
        }
        const value = await object.text();
        const split = value.indexOf("\n");
        if (split === -1) return null;
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
        await bucket.put(objectKey(key), `${head}\n${await stored.text()}`, {
          customMetadata: {
            version,
            expiresAt: String(nowS() + fresh + EDGE_CACHE_STALE_S),
          },
        });
      } catch {}
    },
  };
}
