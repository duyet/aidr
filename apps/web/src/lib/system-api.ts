/** Shared env/response plumbing for /api/system and the granular
 * /api/system/* endpoints. Each endpoint resolves the Worker env the same
 * way (TanStack context → cloudflare:workers fallback), runs one batched
 * section loader, and returns a short edge-cached JSON body. */

export const SYSTEM_CACHE_CONTROL =
  "public, max-age=15, s-maxage=30, stale-while-revalidate=120";
/** Model chains only change on deploy — safe to cache longer. */
export const MODELS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export async function resolveWorkerEnv(context: any): Promise<any> {
  let env =
    context?.cloudflare?.env || context?.env || (globalThis as any).CF_ENV;
  if (!env?.DB) {
    try {
      env = (await import("cloudflare:workers")).env;
    } catch {
      // not running in a workers runtime
    }
  }
  return env;
}

export async function systemDb(context: any): Promise<D1Database | undefined> {
  const env = await resolveWorkerEnv(context);
  return env?.DB;
}

export function systemJson(
  data: unknown,
  cacheControl = SYSTEM_CACHE_CONTROL
): Response {
  return Response.json(data, {
    headers: { "Cache-Control": cacheControl },
  });
}

/** Resolve the DB binding, run the section loader, JSON it — 500s match
 * the existing /api/system behavior. */
export async function systemHandler(
  context: any,
  tag: string,
  load: (db: D1Database) => Promise<unknown>
): Promise<Response> {
  const db = await systemDb(context);
  if (!db) {
    return Response.json(
      { error: "D1 binding DB not configured" },
      { status: 500 }
    );
  }
  try {
    return systemJson(await load(db));
  } catch (e) {
    console.error(`system/${tag}:`, e);
    return Response.json({ error: "query failed" }, { status: 500 });
  }
}
