import { useCallback, useEffect, useState } from "react";
import type { CalendarMonth } from "../../lib/calendar";
import { fetchCalendarMonth } from "../../lib/calendar-fn";

export type CalendarMonthState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; cal: CalendarMonth };

const CURRENT = "current";

/** Successful months only, kept for the page session; failures retry. */
const cache = new Map<string, CalendarMonth>();
/** In-flight requests by key, so a reopen during a fetch joins it. */
const pending = new Map<string, Promise<CalendarMonth | null>>();

export function clearCalendarMonthCache(): void {
  cache.clear();
  pending.clear();
}

function load(key: string, month: string | undefined) {
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = fetchCalendarMonth({ data: month ? { month } : {} })
    .then((cal) => {
      if (cal) {
        cache.set(key, cal);
        cache.set(cal.month, cal);
      }
      return cal;
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}

/**
 * One month for the header calendar; `undefined` asks for the current one.
 * `retry` clears a failure and fetches again.
 */
export function useCalendarMonth(month: string | undefined): {
  state: CalendarMonthState;
  retry: () => void;
} {
  const key = month ?? CURRENT;
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (cache.has(key)) return;
    let live = true;
    setFailed(null);
    load(key, month)
      .then((cal) => {
        if (!live) return;
        if (!cal) setFailed(key);
        setTick((t) => t + 1);
      })
      .catch(() => {
        if (live) setFailed(key);
      });
    return () => {
      live = false;
    };
  }, [key, month, attempt]);

  const cal = cache.get(key);
  if (cal) return { state: { status: "ready", cal }, retry };
  return {
    state: failed === key ? { status: "error" } : { status: "loading" },
    retry,
  };
}
