import { createServerFn } from "@tanstack/react-start";
import { parseArchiveDate } from "./day-archive";
import { readSession } from "./db";
import { stripItemDetail } from "./feed-fn";
import { type DayArchive, getDayArchive } from "./feed-queries";
import { weekOfArchiveDate } from "./week";
import { weekEditionExists } from "./week-queries";

/**
 * Server fn for the `/date/$date` loader. Returns null for an invalid or
 * future date and when the D1 binding is missing; the route turns both
 * into a 404.
 * A failed read throws `day_unavailable`, which the route renders as a 500.
 * Rows ship collapsed (like the homepage SSR feed) and refetch detail on
 * expand.
 */
export const fetchDayArchive = createServerFn({ method: "GET" })
  .validator((input: { date: string }) => input)
  .handler(async ({ data }): Promise<DayArchive | null> => {
    const date = parseArchiveDate(data.date, Date.now());
    if (!date) return null;
    const { env } = await import("cloudflare:workers");
    const db = (env as { DB?: D1Database }).DB;
    if (!db) return null;
    try {
      const session = readSession(db);
      const candidateWeek = weekOfArchiveDate(date);
      const [found, hasWeek] = await Promise.all([
        getDayArchive(session, date),
        candidateWeek
          ? weekEditionExists(session, candidateWeek)
          : Promise.resolve(false),
      ]);
      const archive = { ...found, week: hasWeek ? candidateWeek : null };
      return archive.day
        ? {
            ...archive,
            day: {
              ...archive.day,
              items: archive.day.items.map(stripItemDetail),
            },
          }
        : archive;
    } catch (error) {
      console.error("day page failed", error);
      // Start serializes a loader error into the page; keep D1 text out.
      throw new Error("day_unavailable");
    }
  });
