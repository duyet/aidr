import { useEffect, useState } from "react";
import type { CalendarMonth } from "../../lib/calendar";
import { fetchCalendarMonth } from "../../lib/calendar-fn";

export type CalendarMonthState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; cal: CalendarMonth };

const CURRENT = "current";

/** Successful months only, kept for the page session; failures retry. */
const cache = new Map<string, CalendarMonth>();

export function clearCalendarMonthCache(): void {
  cache.clear();
}

/** One month for the header calendar; `undefined` asks for the current one. */
export function useCalendarMonth(
  month: string | undefined
): CalendarMonthState {
  const key = month ?? CURRENT;
  const [failed, setFailed] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (cache.has(key)) return;
    let live = true;
    setFailed(null);
    fetchCalendarMonth({ data: month ? { month } : {} })
      .then((cal) => {
        if (cal) {
          cache.set(key, cal);
          cache.set(cal.month, cal);
        }
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
  }, [key, month]);

  const cal = cache.get(key);
  if (cal) return { status: "ready", cal };
  return failed === key ? { status: "error" } : { status: "loading" };
}
