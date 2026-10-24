import { createServerFn } from "@tanstack/react-start";
import { type CalendarMonth, currentMonth, parseMonth } from "./calendar";
import { getCalendarMonth } from "./calendar-queries";
import { readSession } from "./db";

/**
 * Server fn for the `/calendar` loader. A missing or invalid month falls back
 * to the current one; null only when D1 is unavailable or the read fails.
 */
export const fetchCalendarMonth = createServerFn({ method: "GET" })
  .validator((input: { month?: string }) => input)
  .handler(async ({ data }): Promise<CalendarMonth | null> => {
    const now = Date.now();
    const last = currentMonth(now);
    const month = parseMonth(data.month, now) ?? last;
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return null;
    try {
      return await getCalendarMonth(readSession(db), month, last);
    } catch {
      return null;
    }
  });
