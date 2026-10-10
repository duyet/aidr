import { createServerFn } from "@tanstack/react-start";
import { readSession } from "./db";
import { stripItemDetail } from "./feed-fn";
import { parseWeek } from "./week";
import {
  getWeekEdition,
  listWeekEditions,
  type WeekEdition,
  type WeekSummary,
} from "./week-queries";

async function db(): Promise<D1Database | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { DB?: D1Database }).DB;
}

/**
 * Server fn for the `/week/$week` loader. Null for a malformed, pre-launch
 * or still-open week, when D1 is unavailable, or when there is no edition;
 * the route turns all of them into a 404. Rows ship collapsed.
 */
export const fetchWeekEdition = createServerFn({ method: "GET" })
  .inputValidator((input: { week: string }) => input)
  .handler(async ({ data }): Promise<WeekEdition | null> => {
    const week = parseWeek(data.week, Date.now());
    if (!week) return null;
    const binding = await db();
    if (!binding) return null;
    try {
      const edition = await getWeekEdition(readSession(binding), week);
      return edition
        ? {
            ...edition,
            stories: edition.stories.map((s) => ({
              ...s,
              item: stripItemDetail(s.item),
            })),
          }
        : null;
    } catch {
      return null;
    }
  });

/** Server fn for `/weeks`: every edition, newest first. */
export const fetchWeekIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<WeekSummary[]> => {
    const binding = await db();
    if (!binding) return [];
    return listWeekEditions(readSession(binding));
  }
);
