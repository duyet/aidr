/**
 * Scores the day card (the Telegram and Facebook day image, also the day
 * page's og:image) and the story OG images of its tiles, EN and VI.
 *
 *   pnpm --filter @aidr/web exec tsx scripts/review/card.ts [--date YYYY-MM-DD] [--fixture <json>] [--json <out>]
 *
 * Live mode reads the day from production D1 (SELECT only) with the route's
 * own `getDayArchive`, builds the card with the route's own `dayCardModel`
 * and `dayOgCard`, and fetches the published PNGs from aidr.today.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { latestArchiveDate } from "../../src/lib/day-archive";
import { layoutStories } from "../../src/lib/day-card-layout";
import {
  DAY_CARD_CANDIDATES,
  dayCardTileCount,
  hasDayOgCopy,
  pickDayCardItems,
} from "../../src/lib/day-card-pick";
import {
  DAY_OG_HEIGHT,
  DAY_OG_WIDTH,
  dayCardModel,
  dayOgCard,
  MIN_PREVIEW_PX,
  PREVIEW_WIDTH,
} from "../../src/lib/day-og";
import {
  type DrawnHeadline,
  drawnHeadlines,
} from "../../src/lib/day-og-headlines";
import type { DbReader } from "../../src/lib/db";
import { localizedTitle } from "../../src/lib/display-title";
import { getDayArchive } from "../../src/lib/feed-queries";
import type { StoryOgImage } from "../../src/lib/story-og";
import type { FeedItem, Lang } from "../../src/lib/types";
import { wranglerSelect } from "../cf-d1";
import {
  type AutoResult,
  emit,
  type Report,
  type RubricRow,
  scoreRubric,
} from "./rubric";

export const RUBRIC: RubricRow[] = [
  {
    id: "render-size",
    points: 2,
    auto: true,
    ask: "Every fetched PNG is 1200x630 and at most 5 MB (Telegram's URL ceiling)",
  },
  {
    id: "tile-count",
    points: 2,
    auto: true,
    ask: "Tiles are pickDayCardItems on the ranked day: every story up to six (#952)",
  },
  {
    id: "fit-320",
    points: 2,
    auto: true,
    ask: "Every tile headline is drawn whole and at least 6 px tall when the card is 320 px wide",
  },
  {
    id: "no-repeat",
    points: 1,
    auto: true,
    ask: "No story or headline appears on two tiles",
  },
  {
    id: "lang-copy",
    points: 1,
    auto: true,
    ask: "Every tile has a headline in the card's language (hasDayOgCopy)",
  },
  {
    id: "lead-reads",
    points: 1,
    ask: "At 320 px one story clearly leads; the eye lands on tile 1 first",
  },
  {
    id: "photo-crops",
    points: 1,
    ask: "No photo crop cuts a face, a logo or the subject in half",
  },
];

/** Telegram's fetcher refuses a photo URL above 5 MB
 *  (worker/notify/telegram-photo-upload.ts). */
export const PNG_BYTE_BUDGET = 5 * 1024 * 1024;

/** What the card needs from a stored story. */
export type CardItem = Pick<
  FeedItem,
  "id" | "title" | "title_vi" | "image_url"
>;

export interface FetchedImage {
  url: string;
  status: number;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
}

export interface CardLang {
  lang: Lang;
  /** The day's stories in rank order, before the language filter. */
  items: CardItem[];
  /** Story ids the card paints, in paint order. */
  tiles: string[];
  headlines: DrawnHeadline[];
  images: FetchedImage[];
}

export interface CardInput {
  date: string;
  langs: CardLang[];
}

function eligible(c: CardLang): CardItem[] {
  return c.items
    .filter((item) => hasDayOgCopy(item, c.lang))
    .slice(0, DAY_CARD_CANDIDATES);
}

function titleIn(item: CardItem, lang: Lang): string {
  return localizedTitle(item, lang).text.replace(/\s+/g, " ").trim();
}

function renderSize(input: CardInput): string[] {
  const out: string[] = [];
  for (const c of input.langs) {
    if (c.images.length === 0) out.push(`${c.lang}: no image was fetched`);
    for (const img of c.images) {
      const at = `${c.lang} ${img.url}`;
      if (img.status !== 200) out.push(`${at}: HTTP ${img.status}`);
      else if (!img.contentType.startsWith("image/png"))
        out.push(`${at}: content-type ${img.contentType}, not image/png`);
      else if (img.width !== DAY_OG_WIDTH || img.height !== DAY_OG_HEIGHT)
        out.push(
          `${at}: ${img.width}x${img.height}, not ${DAY_OG_WIDTH}x${DAY_OG_HEIGHT}`
        );
      if (img.bytes > PNG_BYTE_BUDGET)
        out.push(`${at}: ${img.bytes} bytes, over ${PNG_BYTE_BUDGET}`);
    }
  }
  return out;
}

function tileCount(input: CardInput): string[] {
  const out: string[] = [];
  for (const c of input.langs) {
    const ranked = eligible(c);
    const want = pickDayCardItems(ranked).map((item) => item.id);
    const count = dayCardTileCount(ranked.length);
    if (c.tiles.length !== count) {
      out.push(
        `${c.lang}: ${c.tiles.length} tiles for ${ranked.length} stories, want ${count}`
      );
    }
    want.forEach((id, i) => {
      if (c.tiles[i] !== id) {
        out.push(
          `${c.lang} tile ${i + 1}: ${c.tiles[i] ?? "missing"}, pickDayCardItems gives ${id}`
        );
      }
    });
    for (const id of c.tiles.slice(want.length)) {
      out.push(`${c.lang}: extra tile ${id}`);
    }
  }
  return out;
}

function fit320(input: CardInput): string[] {
  const out: string[] = [];
  const scale = PREVIEW_WIDTH / DAY_OG_WIDTH;
  for (const c of input.langs) {
    const byId = new Map(c.items.map((item) => [item.id, item]));
    for (const id of c.tiles) {
      const item = byId.get(id);
      const drawn = c.headlines.find((h) => h.id === id);
      if (!item || !drawn) {
        out.push(`${c.lang} ${id}: no headline drawn`);
        continue;
      }
      if (drawn.text !== titleIn(item, c.lang)) {
        out.push(`${c.lang} ${id}: cut to "${drawn.text}"`);
      }
      const px = drawn.fontSize * scale;
      if (px < MIN_PREVIEW_PX) {
        out.push(
          `${c.lang} ${id}: ${px.toFixed(1)} px at ${PREVIEW_WIDTH} wide, under ${MIN_PREVIEW_PX}`
        );
      }
    }
  }
  return out;
}

function noRepeat(input: CardInput): string[] {
  const out: string[] = [];
  for (const c of input.langs) {
    const byId = new Map(c.items.map((item) => [item.id, item]));
    const seenIds = new Set<string>();
    const seenTitles = new Map<string, string>();
    for (const id of c.tiles) {
      if (seenIds.has(id)) out.push(`${c.lang} ${id}: on two tiles`);
      seenIds.add(id);
      const item = byId.get(id);
      if (!item) continue;
      const key = titleIn(item, c.lang).toLowerCase();
      const other = seenTitles.get(key);
      if (other && other !== id)
        out.push(`${c.lang} ${id}: same headline as ${other}`);
      seenTitles.set(key, id);
    }
  }
  return out;
}

function langCopy(input: CardInput): string[] {
  const out: string[] = [];
  for (const c of input.langs) {
    const byId = new Map(c.items.map((item) => [item.id, item]));
    for (const id of c.tiles) {
      const item = byId.get(id);
      if (!item) out.push(`${c.lang} ${id}: not a story of ${input.date}`);
      else if (!hasDayOgCopy(item, c.lang))
        out.push(
          `${c.lang} ${id}: no ${c.lang} headline ("${titleIn(item, c.lang)}")`
        );
    }
  }
  return out;
}

export function autoChecks(input: CardInput): AutoResult {
  return {
    "render-size": renderSize(input),
    "tile-count": tileCount(input),
    "fit-320": fit320(input),
    "no-repeat": noRepeat(input),
    "lang-copy": langCopy(input),
  };
}

export function scoreCard(input: CardInput): Report {
  return scoreRubric(`card ${input.date}`, RUBRIC, autoChecks(input));
}

/** Width and height from a PNG's IHDR, or 0x0 when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) {
    return { width: 0, height: 0 };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

class Statement {
  constructor(
    readonly sql: string,
    readonly binds: unknown[] = []
  ) {}
  bind(...binds: unknown[]) {
    return new Statement(this.sql, binds);
  }
  text() {
    let i = 0;
    return this.sql
      .replace(/\?/g, () => sqlLiteral(this.binds[i++]))
      .replace(/\s+/g, " ")
      .trim();
  }
  async all() {
    return { results: wranglerSelect(this.text()) };
  }
  async first() {
    return (await this.all()).results[0] ?? null;
  }
}

const productionReader = {
  prepare: (sql: string) => new Statement(sql),
  batch: async (stmts: Statement[]) => Promise.all(stmts.map((s) => s.all())),
} as unknown as DbReader;

/** A photo stand-in: live mode does not fetch publisher CDNs, so every
 *  photo URL counts as loaded. That is the photo-rich layout, where tiles
 *  are smallest. */
const STUB_PHOTO: StoryOgImage = {
  dataUri: "data:image/png;base64,",
  mimeType: "image/png",
  byteLength: 0,
  width: 1200,
  height: 630,
};

export async function fetchImage(url: string): Promise<FetchedImage> {
  const res = await fetch(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    url,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    ...pngSize(bytes),
    bytes: bytes.byteLength,
  };
}

const SITE = "https://aidr.today";

/** The day's stories, ranked, as the day card route reads them. */
export async function loadDayItems(date: string): Promise<FeedItem[]> {
  const archive = await getDayArchive(productionReader, date);
  return archive.day?.items ?? [];
}

/**
 * The card's tiles and drawn headlines for `items`, from the route's own
 * model and layout. `fetchImage` reads each published PNG.
 */
export async function cardFromItems(
  date: string,
  items: readonly FeedItem[],
  fetchImage: (url: string) => Promise<FetchedImage>,
  photos = true
): Promise<CardInput> {
  const langs: CardLang[] = [];
  for (const lang of ["en", "vi"] as const) {
    const model = await dayCardModel({
      date,
      lang,
      items,
      today: date === latestArchiveDate(Date.now()),
      fetchPhoto: async () => (photos ? STUB_PHOTO : null),
    });
    const stories = layoutStories(model.layout);
    const urls = [
      `${SITE}/api/og/date/${date}.png?lang=${lang}`,
      ...stories.map((s) => `${SITE}/api/og/${s.id}.png?lang=${lang}`),
    ];
    langs.push({
      lang,
      items: items.map(({ id, title, title_vi, image_url }) => ({
        id,
        title,
        title_vi,
        image_url,
      })),
      tiles: stories.map((s) => s.id),
      headlines: drawnHeadlines(dayOgCard(model), stories),
      images: await Promise.all(urls.map(fetchImage)),
    });
  }
  return { date, langs };
}

export async function loadCard(date: string): Promise<CardInput> {
  return cardFromItems(date, await loadDayItems(date), fetchImage);
}

function flag(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

async function main(argv: readonly string[]) {
  const fixture = flag(argv, "--fixture");
  const input: CardInput = fixture
    ? JSON.parse(readFileSync(resolve(fixture), "utf8"))
    : await loadCard(flag(argv, "--date") ?? latestArchiveDate(Date.now()));
  emit([scoreCard(input)], argv);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
