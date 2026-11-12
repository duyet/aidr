import { createServerFn } from "@tanstack/react-start";
import { readSession } from "./db";
import { stripItemDetail } from "./feed-fn";
import { renderedStoryCardUrls } from "./og-cards";
import type { Lang } from "./types";
import { currentOpenWeek, parseWeek } from "./week";
import type { OpenWeekSummary, WeekEdition, WeekSummary } from "./week-model";
import { buildOpenWeekEdition } from "./week-open";
import { getWeekEdition, listWeekEditions } from "./week-queries";

async function db(): Promise<D1Database | undefined> {
  const { env } = await import("cloudflare:workers");
  return (env as { DB?: D1Database }).DB;
}

/** Both languages render the same item set; strip heavy fields and attach
 * the lead card URLs when the renderer has stored servable cards. */
function collapseEdition(
  edition: WeekEdition,
  urls?: Partial<Record<Lang, string>>
): WeekEdition {
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
  return collapseEdition(edition, urls);
}

/**
 * Server fn for the `/week/$week` loader. A closed week reads
 * `weekly_snapshots`; the in-progress week gets a provisional edition
 * ranked live from the data that exists so far (no model copy). Null for
 * a malformed, pre-launch or still-open-and-empty week; the route turns
 * all of them into a 404. A failed read throws `week_unavailable`, which
 * the route renders as a 500. Rows ship collapsed.
 */
export const fetchWeekEdition = createServerFn({ method: "GET" })
  .validator((input: { week: string }) => input)
  .handler(async ({ data }): Promise<WeekEdition | null> => {
    const binding = await db();
    if (!binding) return null;
    const nowMs = Date.now();
    const week = parseWeek(data.week, nowMs);
    if (week) {
      let edition: WeekEdition | null;
      try {
        edition = await getWeekEdition(readSession(binding), week);
      } catch (error) {
        console.error("week page failed", error);
        // Start serializes a loader error into the page; keep D1 text out.
        throw new Error("week_unavailable");
      }
      return edition
        ? await withLeadCards(readSession(binding), edition)
        : null;
    }
    // The in-progress week has no snapshot; rank it live instead. Replaced
    // by the stored edition once the week closes.
    try {
      const open = await buildOpenWeekEdition(binding, data.week, nowMs);
      return open ? collapseEdition(open) : null;
    } catch (error) {
      console.error("open week page failed", error);
      throw new Error("week_unavailable");
    }
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

/** Server fn for `/weeks`: the provisional stand-in for the in-progress
 * week, or null before the first story lands. A failed read throws, so
 * the edge-cached index never stores a half-built row. */
export const fetchCurrentOpenWeek = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpenWeekSummary | null> => {
    const binding = await db();
    if (!binding) return null;
    const nowMs = Date.now();
    const week = currentOpenWeek(nowMs);
    if (!week) return null;
    try {
      const edition = await buildOpenWeekEdition(binding, week, nowMs);
      if (!edition) return null;
      const lead = edition.stories[0]?.item;
      return {
        week: edition.week,
        issue: edition.issue,
        start_date: edition.start_date,
        end_date: edition.end_date,
        image_url: lead?.image_url ?? null,
        lead_tags: lead?.tags ?? [],
        stories: edition.stories.length,
      };
    } catch (error) {
      console.error("current open week failed", error);
      // Start serializes a loader error into the page; keep D1 text out.
      throw new Error("open_week_unavailable");
    }
  }
);
