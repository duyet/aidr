import { useEffect, useState } from "react";
import type { SystemStats } from "./system-queries";

export interface SystemStatsState {
  stats: SystemStats | null;
  error: boolean;
}

/** Fetches /api/system once. The shell renders immediately; each card
 *  skeletons locally until stats land, so first paint never waits. */
export function useSystemStats(): SystemStatsState {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system")
      .then((res) => (res.ok ? (res.json() as Promise<SystemStats>) : null))
      .then((res) => {
        if (cancelled) return;
        if (res) setStats(res);
        else setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, error };
}
