import { useEffect, useState } from "react";

/** Module-level cache of /api/system/* responses shared by every card on
 * /data: concurrent mounts share one in-flight request and later tabs get
 * the resolved value instantly. Failed fetches are evicted so a remount
 * retries instead of pinning the error. */
const pending = new Map<string, Promise<unknown | null>>();

function fetchSystem<T>(path: string): Promise<T | null> {
  let p = pending.get(path) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(path)
      .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
      .catch(() => null)
      .then((res) => {
        if (res === null) pending.delete(path);
        return res;
      });
    pending.set(path, p);
  }
  return p;
}

export interface SystemDataState<T> {
  data: T | null;
  error: boolean;
}

/** Fetches one /api/system/* endpoint once per session. Each card renders
 * its own skeleton until its section lands — first paint never waits on
 * the slowest query. */
export function useSystemData<T>(path: string): SystemDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    fetchSystem<T>(path).then((res) => {
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
