import { createServerFn } from "@tanstack/react-start";
import { parseArchiveDate } from "./day-archive";
import { readSession } from "./db";
import { stripItemDetail } from "./feed-fn";
import { type DayArchive, getDayArchive } from "./feed-queries";

/**
 * Server fn for the `/date/$date` loader. Returns null for an invalid or
 * future date and when D1 is unavailable; the route turns both into a 404.
 * Rows ship collapsed (like the homepage SSR feed) and refetch detail on
 * expand.
 */
export const fetchDayArchive = createServerFn({ method: "GET" })
  .inputValidator((input: { date: string }) => input)
  .handler(async ({ data }): Promise<DayArchive | null> => {
    const date = parseArchiveDate(data.date, Date.now());
    if (!date) return null;
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return null;
    try {
      const archive = await getDayArchive(readSession(db), date);
      return archive.day
        ? {
            ...archive,
            day: {
              ...archive.day,
              items: archive.day.items.map(stripItemDetail),
            },
          }
        : archive;
    } catch {
      return null;
    }
  });
