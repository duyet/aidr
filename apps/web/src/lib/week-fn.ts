import { createServerFn } from "@tanstack/react-start";
import { readSession } from "./db";
import { stripItemDetail } from "./feed-fn";
import { renderedStoryCardUrls } from "./og-cards";
import type { Lang } from "./types";
import { parseWeek } from "./week";
import type { WeekEdition, WeekSummary } from "./week-model";
import { getWeekEdition, listWeekEditions } from "./week-queries";

async function db(): Promise<D1Database | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { DB?: D1Database }).DB;
}

/** Attach the per-language OG card URLs of the lead story when a card is
 * stored and current, so the week page can unfurl even when the publisher
 * image is gone upstream (the card route is the site's own). Best effort:
 * a failed read leaves the publisher image as the og:image. */
async function withLeadCards(
  session: ReturnType<typeof readSession>,
  edition: WeekEdition
): Promise<WeekEdition> {
  const lead = edition.stories[0];
  let urls: Partial<Record<Lang, string>> | undefined;
  try {
    urls = lead ? await renderedStoryCardUrls(session, lead.item) : undefined;
  } catch (error) {
    console.error("week lead og card lookup failed", error);
  }
  return {
    ...edition,
    stories: edition.stories.map((s, i) => ({
      ...s,
      item: stripItemDetail(
        i === 0 && urls && Object.keys(urls).length > 0
          ? { ...s.item, og_card_urls: urls }
          : s.item
      ),
    })),
  };
}

/**
 * Server fn for the `/week/$week` loader. Null for a malformed, pre-launch
 * or still-open week, when D1 is unavailable, or when there is no edition;
 * the route turns all of them into a 404. A failed read throws
 * `week_unavailable`, which the route renders as a 500. Rows ship collapsed.
 */
export const fetchWeekEdition = createServerFn({ method: "GET" })
  .validator((input: { week: string }) => input)
  .handler(async ({ data }): Promise<WeekEdition | null> => {
    const week = parseWeek(data.week, Date.now());
    if (!week) return null;
    const binding = await db();
    if (!binding) return null;
    let edition: WeekEdition | null;
    try {
      edition = await getWeekEdition(readSession(binding), week);
    } catch (error) {
      console.error("week page failed", error);
      // Start serializes a loader error into the page; keep D1 text out.
      throw new Error("week_unavailable");
    }
    return edition ? await withLeadCards(readSession(binding), edition) : null;
  });

/** Server fn for `/weeks`: every edition, newest first. A failed read
 * throws `weeks_unavailable`, which the route renders as an uncached 500. */
export const fetchWeekIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<WeekSummary[]> => {
    const binding = await db();
    if (!binding) return [];
    try {
      return await listWeekEditions(readSession(binding));
    } catch (error) {
      console.error("weeks index failed", error);
      // Start serializes a loader error into the page; keep D1 text out.
      throw new Error("weeks_unavailable");
    }
  }
);
