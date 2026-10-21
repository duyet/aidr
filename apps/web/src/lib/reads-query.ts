import type { DbReader } from "./db";

export const READS_WINDOW_DAYS = 28;

export interface ReadTotal {
  name: string;
  reads: number;
}

export interface CategoryReads extends ReadTotal {
  items: number;
}

/** A story row is listed only from this many opens, so a count of one or two
 * readers can't single anyone out. `count` is hits, not readers, so a channel
 * with a handful of readers (email, telegram, extension) needs a higher floor
 * or a few opens could be one reader. Broadcast channels use the default. */
export const TOP_STORIES_MIN_OPENS = 3;
export const TOP_STORIES_MIN_OPENS_BY_CHANNEL: Readonly<
  Record<string, number>
> = { email: 10, telegram: 10, extension: 10 };
export const TOP_STORIES_WINDOW_DAYS = 7;
export const TOP_STORIES_PER_CHANNEL = 5;

export interface TopStory {
  id: string;
  title: string;
  opens: number;
  outbound: number;
}

export interface ChannelTopStories {
  channel: string;
  stories: TopStory[];
}

export interface SystemReads {
  window_days: number;
  total: number;
  by_category: CategoryReads[];
  by_channel: ReadTotal[];
  by_kind: ReadTotal[];
  top_stories: ChannelTopStories[];
}

const WINDOW = `FROM item_reads r JOIN items i ON i.id = r.item_id
  WHERE r.day >= date('now', ?1)`;

const CATEGORY_SQL = `SELECT COALESCE(i.category, 'Uncategorized') AS name,
    SUM(r.count) AS reads, COUNT(DISTINCT r.item_id) AS items
  ${WINDOW} GROUP BY name ORDER BY reads DESC, name`;
const CHANNEL_SQL = `SELECT r.channel AS name, SUM(r.count) AS reads
  ${WINDOW} GROUP BY name ORDER BY reads DESC, name`;
const KIND_SQL = `SELECT r.kind AS name, SUM(r.count) AS reads
  ${WINDOW} GROUP BY name ORDER BY reads DESC, name`;

// Reads on a merged id count for its canonical, as in READ_COUNT_JOIN_I.
const MIN_OPENS_CASE = `CASE f.channel ${Object.entries(
  TOP_STORIES_MIN_OPENS_BY_CHANNEL
)
  .map(([channel, min]) => `WHEN '${channel}' THEN ${Number(min)}`)
  .join(" ")} ELSE ?2 END`;

const TOP_STORIES_SQL = `WITH folded AS (
    SELECT COALESCE(m.duplicate_of, r.item_id) AS id, r.channel,
      SUM(CASE WHEN r.kind = 'open' THEN r.count ELSE 0 END) AS opens,
      SUM(CASE WHEN r.kind = 'outbound' THEN r.count ELSE 0 END) AS outbound
    FROM item_reads r
    LEFT JOIN items m ON m.id = r.item_id AND m.status = 'merged'
    WHERE r.day >= date('now', ?1)
    GROUP BY 1, 2
  ), ranked AS (
    SELECT f.id, f.channel, f.opens, f.outbound, i.title,
      ROW_NUMBER() OVER (
        PARTITION BY f.channel ORDER BY f.opens DESC, f.outbound DESC, f.id
      ) AS rn
    FROM folded f JOIN items i ON i.id = f.id AND i.status = 'published'
    WHERE f.opens >= ${MIN_OPENS_CASE}
  )
  SELECT id, channel, title, opens, outbound FROM ranked
  WHERE rn <= ?3 ORDER BY channel, rn`;

function groupTopStories(
  rows: (TopStory & { channel: string })[]
): ChannelTopStories[] {
  const byChannel = new Map<string, TopStory[]>();
  for (const { channel, ...story } of rows) {
    const list = byChannel.get(channel) ?? [];
    list.push(story);
    byChannel.set(channel, list);
  }
  const opens = (c: ChannelTopStories) =>
    c.stories.reduce((sum, s) => sum + s.opens, 0);
  return [...byChannel]
    .map(([channel, stories]) => ({ channel, stories }))
    .sort((a, b) => opens(b) - opens(a) || a.channel.localeCompare(b.channel));
}

export async function loadSystemReads(db: DbReader): Promise<SystemReads> {
  const offset = `-${READS_WINDOW_DAYS - 1} days`;
  const batch = await db.batch([
    db.prepare(CATEGORY_SQL).bind(offset),
    db.prepare(CHANNEL_SQL).bind(offset),
    db.prepare(KIND_SQL).bind(offset),
    db
      .prepare(TOP_STORIES_SQL)
      .bind(
        `-${TOP_STORIES_WINDOW_DAYS - 1} days`,
        TOP_STORIES_MIN_OPENS,
        TOP_STORIES_PER_CHANNEL
      ),
  ]);
  const [categories, channels, kinds, tops] = batch.map(
    (r) => r?.results ?? []
  );
  const byKind = kinds as ReadTotal[];
  return {
    window_days: READS_WINDOW_DAYS,
    total: byKind.reduce((sum, k) => sum + k.reads, 0),
    by_category: categories as CategoryReads[],
    by_channel: channels as ReadTotal[],
    by_kind: byKind,
    top_stories: groupTopStories(tops as (TopStory & { channel: string })[]),
  };
}
