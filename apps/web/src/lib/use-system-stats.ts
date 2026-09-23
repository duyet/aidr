import { useEffect, useState } from "react";
import { fetchJson, getCachedJson } from "./client-cache";

/** Instant-paint budgets for the sessionStorage cache, mirroring each
 * endpoint's advertised max-age (system-api.ts): data sections sit behind
 * max-age=15/s-maxage=30, while model chains are env config that only
 * changes on deploy, so a long budget is safe — the background refetch
 * corrects either way. */
const SYSTEM_TTL_MS = 30_000;
const MODELS_TTL_MS = 60 * 60 * 1000;

export interface SystemDataState<T> {
  data: T | null;
  error: boolean;
}

/** Fetches one /api/system/* endpoint once per session. Initial state is
 * always null so SSR/hydration agree, then the first effect swaps in any
 * fresh-enough sessionStorage copy while the network revalidates — a
 * repeat visit paints instantly; first visits render the card's own
 * skeleton, so first paint never waits on the slowest query. */
export function useSystemData<T>(path: string): SystemDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const ttl = path === "/api/system/models" ? MODELS_TTL_MS : SYSTEM_TTL_MS;
    const cached = getCachedJson<T>(path, ttl);
    if (cached !== null) setData(cached);
    fetchJson<T>(path).then((res) => {
      if (cancelled) return;
      if (res === null) setError(true);
      else setData(res);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, error };
}
