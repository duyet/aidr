import type { ReactElement, ReactNode } from "react";
import {
  chooseDayCardLayout,
  type DayCardLayout,
  type DayCardStory,
  layoutStories,
} from "./day-card-layout";
import {
  DAY_CARD_CANDIDATES,
  hasDayOgCopy,
  isDayCardPhotoUrl,
  pickDayCardItems,
} from "./day-card-pick";
import { localizedTitle } from "./display-title";
import { type FitBox, fitText } from "./og-text-fit";
import type { StoryOgImage } from "./story-og";
import type { FeedItem, Lang } from "./types";

/**
 * Day card for `/date/YYYY-MM-DD`: the day's top stories, laid out for that
 * day's content (`day-card-layout.ts`). Used as the day page's `og:image`
 * and as the Telegram daily digest image.
 */
export const DAY_OG_WIDTH = 1200;
export const DAY_OG_HEIGHT = 630;

const YELLOW = "#f5c518";
const INK = "#0a0a0a";
const AMBER = "#b45309";
const RULE = "rgba(10, 10, 10, 0.28)";

const PAD = 36;
const HEADER = 92;
const GAP = 24;
const BODY_W = DAY_OG_WIDTH - PAD * 2;
const BODY_H = DAY_OG_HEIGHT - PAD * 2 - HEADER;

export { hasDayOgCopy };

export interface DayCardModel {
  date: string;
  lang: Lang;
  layout: DayCardLayout;
}

export function dayCardStory(
  item: FeedItem,
  image: StoryOgImage | null,
  lang: Lang,
  rank: number
): DayCardStory {
  return {
    id: item.id,
    rank,
    title: localizedTitle(item, lang).text.replace(/\s+/g, " ").trim(),
    kicker: (item.tags[0] ?? item.category ?? "")
      .toUpperCase()
      .slice(0, 28)
      .trim(),
    image,
  };
}

/**
 * The card for one day and language. The stories are the digest's
 * (`pickDayCardItems`, at most six, so one fetch batch); `fetchPhoto`
 * resolves each story's photo, and the layout follows from which loaded.
 */
export async function dayCardModel(input: {
  date: string;
  lang: Lang;
  items: readonly FeedItem[];
  today: boolean;
  fetchPhoto: (url: string) => Promise<StoryOgImage | null>;
}): Promise<DayCardModel> {
  const { date, lang } = input;
  const ranked = input.items
    .filter((item) => hasDayOgCopy(item, lang))
    .slice(0, DAY_CARD_CANDIDATES);
  const picked = pickDayCardItems(ranked);
  const images = await Promise.all(
    picked.map((item) =>
      isDayCardPhotoUrl(item.image_url)
        ? input.fetchPhoto(item.image_url)
        : null
    )
  );
  const stories = picked.map((item, i) =>
    dayCardStory(item, images[i] ?? null, lang, i + 1)
  );
  return { date, lang, layout: chooseDayCardLayout(stories, input.today) };
}

/** Day heading parts from a `YYYY-MM-DD` calendar date (no timezone shift). */
export function dayOgDateParts(
  date: string,
  lang: Lang
): { day: string; weekday: string; monthYear: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const fmt = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o }).format(d);
  return {
    day: date.slice(8, 10),
    weekday: fmt({ weekday: "long" }).toUpperCase(),
    monthYear:
      lang === "vi"
        ? `THÁNG ${Number(date.slice(5, 7))} ${date.slice(0, 4)}`
        : fmt({ month: "long", year: "numeric" }).toUpperCase(),
  };
}

/** Title set as two fixed lines (no orphaned last word), then a note. */
const EMPTY_COPY: Record<
  Lang,
  Record<"pending" | "quiet", { title: [string, string]; note: string }>
> = {
  en: {
    pending: {
      title: ["Today's AI stories", "are on the way"],
      note: "Check back soon",
    },
    quiet: {
      title: ["No AI stories", "on this day"],
      note: "Browse other days at aidr.today",
    },
  },
  vi: {
    pending: {
      title: ["Tin AI hôm nay", "đang được cập nhật"],
      note: "Quay lại sau ít phút",
    },
    quiet: {
      title: ["Ngày này", "không có tin AI nào"],
      note: "Xem các ngày khác tại aidr.today",
    },
  },
};

function header(date: string, lang: Lang, count: number) {
  const parts = dayOgDateParts(date, lang);
  const badge =
    count === 0
      ? "AIDR.TODAY"
      : lang === "vi"
        ? `TOP ${count} TIN AI`
        : `TOP ${count} IN AI`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: `${HEADER - 16}px`,
        marginBottom: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div
          style={{
            fontSize: "84px",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-3px",
          }}
        >
          {parts.day}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: "22px",
            fontWeight: 700,
            letterSpacing: "4px",
            lineHeight: 1.3,
          }}
        >
          <span>{parts.weekday}</span>
          <span>{parts.monthYear}</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          backgroundColor: INK,
          padding: "10px 18px 10px 10px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "58px",
            height: "50px",
            backgroundColor: YELLOW,
            color: INK,
            fontSize: "17px",
            fontWeight: 700,
          }}
        >
          AI;DR
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            color: "#ffffff",
            fontSize: "17px",
            fontWeight: 700,
            letterSpacing: "2.5px",
            lineHeight: 1.35,
          }}
        >
          <span>{lang === "vi" ? "AI;DR HÔM NAY" : "AI;DR DAILY"}</span>
          <span>{badge}</span>
        </div>
      </div>
    </div>
  );
}

const LINE_HEIGHT = 1.22;

/** A fitted headline. The clamp and max-height are backstops; `fitText`
 *  already sized the text to the box. */
function headline(
  text: string,
  box: Omit<FitBox, "lineHeight">,
  style: { color: string; weight: 500 | 700 }
) {
  const fit = fitText(text, { ...box, lineHeight: LINE_HEIGHT });
  return (
    <div
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: fit.lines,
        textOverflow: "ellipsis",
        overflow: "hidden",
        width: `${box.width}px`,
        maxHeight: `${Math.ceil(fit.fontSize * LINE_HEIGHT * fit.lines) + 4}px`,
        fontSize: `${fit.fontSize}px`,
        fontWeight: style.weight,
        lineHeight: LINE_HEIGHT,
        color: style.color,
        wordBreak: "break-word",
      }}
    >
      {fit.text}
    </div>
  );
}

function kicker(text: string, color: string, size = 15) {
  if (!text) return null;
  return (
    <div
      style={{
        display: "flex",
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: "2px",
        color,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {text}
    </div>
  );
}

function photo(image: StoryOgImage, w: number, h: number) {
  return (
    <img
      src={image.dataUri}
      alt=""
      width={w}
      height={h}
      style={{ width: `${w}px`, height: `${h}px`, objectFit: "cover" }}
    />
  );
}

/** Rank on a photo's corner. */
function rankFlag(rank: number, size = 44) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${Math.round(size * 0.9)}px`,
        height: `${size}px`,
        backgroundColor: YELLOW,
        color: INK,
        fontSize: `${Math.round(size * 0.62)}px`,
        fontWeight: 700,
      }}
    >
      {String(rank)}
    </div>
  );
}

/** One size for every headline in a group, so a list or a row of tiles
 *  reads as one set: the size that fits the hardest headline. */
function sharedSize(
  items: ReadonlyArray<{ text: string; box: Omit<FitBox, "lineHeight"> }>
): number {
  return Math.min(
    ...items.map(
      ({ text, box }) =>
        fitText(text, { ...box, lineHeight: LINE_HEIGHT }).fontSize
    )
  );
}

interface BlockText {
  sizes: number[];
  maxLines: number;
  kickerSize?: number;
}

function bandPadding(w: number) {
  return w >= 400 ? { padX: 22, padY: 18 } : { padX: 14, padY: 12 };
}

/** `text.sizes` narrowed to the one size that fits every block's headline. */
function sharedBlockText(
  stories: readonly DayCardStory[],
  w: number,
  text: BlockText
): BlockText {
  const width = w - bandPadding(w).padX * 2;
  const size = sharedSize(
    stories.map((s) => ({
      text: s.title,
      box: {
        width,
        height: 10_000,
        sizes: text.sizes,
        maxLines: text.maxLines,
      },
    }))
  );
  return { ...text, sizes: [size] };
}

/** A photo with its headline on an ink band below: screenshots of other
 *  sites carry their own headlines, so nothing is drawn over the image. */
function photoBlock(
  story: DayCardStory,
  w: number,
  h: number,
  text: BlockText
) {
  const { padX, padY } = bandPadding(w);
  const kickerH = text.kickerSize && story.kicker ? text.kickerSize + 8 : 0;
  const titleW = w - padX * 2;
  const fit = fitText(story.title, {
    width: titleW,
    height: 10_000,
    sizes: text.sizes,
    lineHeight: LINE_HEIGHT,
    maxLines: text.maxLines,
  });
  const bandH =
    Math.ceil(fit.fontSize * LINE_HEIGHT * fit.lines) + padY * 2 + kickerH;
  const image = story.image as StoryOgImage;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width: `${w}px`,
        height: `${h}px`,
        backgroundColor: INK,
        overflow: "hidden",
      }}
    >
      {photo(image, w, h - bandH)}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          padding: `${padY}px ${padX}px`,
          height: `${bandH}px`,
        }}
      >
        {text.kickerSize ? kicker(story.kicker, YELLOW, text.kickerSize) : null}
        {headline(
          fit.text,
          {
            width: titleW,
            height: 10_000,
            sizes: [fit.fontSize],
            maxLines: fit.lines,
          },
          { color: "#ffffff", weight: 500 }
        )}
      </div>
      {rankFlag(story.rank, w >= 400 ? 48 : 38)}
    </div>
  );
}

const ROW_SIZES = [30, 28, 26, 25, 24, 23];

function rowBox(story: DayCardStory, w: number, h: number) {
  const numW = 48;
  const thumbH = h - 18;
  const thumbW = story.image ? Math.min(150, Math.round(thumbH * 1.5)) : 0;
  return {
    numW,
    thumbW,
    thumbH,
    text: {
      width: w - numW - (thumbW ? thumbW + 18 : 0),
      height: h - 10,
      sizes: ROW_SIZES,
      maxLines: 2,
    },
  };
}

/** Numbered list row on the yellow ground, thumbnail when it has a photo.
 *  No kicker: at preview size it is noise, and the headline needs the room. */
function listRow(
  story: DayCardStory,
  w: number,
  h: number,
  size: number,
  first: boolean
) {
  const box = rowBox(story, w, h);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: `${w}px`,
        height: `${h}px`,
        borderTop: first ? "none" : `1px solid ${RULE}`,
      }}
    >
      <div
        style={{
          display: "flex",
          width: `${box.numW}px`,
          fontSize: "34px",
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-1px",
        }}
      >
        {String(story.rank)}
      </div>
      {headline(
        story.title,
        { ...box.text, sizes: [size] },
        { color: INK, weight: 500 }
      )}
      {story.image ? (
        <div style={{ display: "flex", marginLeft: "18px" }}>
          {photo(story.image, box.thumbW, box.thumbH)}
        </div>
      ) : null}
    </div>
  );
}

function rowList(rows: readonly DayCardStory[], w: number, h: number) {
  const rowH = Math.floor(h / Math.max(1, rows.length));
  const size = sharedSize(
    rows.map((row) => ({ text: row.title, box: rowBox(row, w, rowH).text }))
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", width: `${w}px` }}>
      {rows.map((row, i) => (
        <div key={row.rank} style={{ display: "flex" }}>
          {listRow(row, w, rowH, size, i === 0)}
        </div>
      ))}
    </div>
  );
}

/** Lead with no photo: ink panel, the headline as the poster. */
function typeLead(story: DayCardStory, w: number, h: number) {
  const pad = 32;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: `${w}px`,
        height: `${h}px`,
        padding: `${pad}px`,
        backgroundColor: INK,
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "48px",
            height: "52px",
            backgroundColor: YELLOW,
            color: INK,
            fontSize: "32px",
            fontWeight: 700,
          }}
        >
          {String(story.rank)}
        </div>
        {kicker(story.kicker, YELLOW, 16)}
      </div>
      {headline(
        story.title,
        {
          width: w - pad * 2,
          height: h - pad * 2 - 52 - 24,
          sizes: [56, 52, 48, 44, 40, 36, 32, 30],
        },
        { color: "#ffffff", weight: 700 }
      )}
    </div>
  );
}

const LEAD_W = 560;

function leadWithList(
  layout: Extract<DayCardLayout, { variant: "lead-list" | "headlines" }>
) {
  const listW = BODY_W - LEAD_W - GAP;
  return (
    <div style={{ display: "flex", gap: `${GAP}px` }}>
      {layout.lead.image
        ? photoBlock(layout.lead, LEAD_W, BODY_H, {
            sizes: [36, 34, 32, 30, 28],
            maxLines: 3,
            kickerSize: 15,
          })
        : typeLead(layout.lead, LEAD_W, BODY_H)}
      {rowList(layout.rows, listW, BODY_H)}
    </div>
  );
}

function mosaic(layout: Extract<DayCardLayout, { variant: "mosaic" }>) {
  const leadW = 520;
  const rightW = BODY_W - leadW - GAP;
  const tileGap = 12;
  const rowH = 84;
  const rowsH = layout.rows.length * rowH;
  const bandH = BODY_H - (rowsH ? rowsH + 8 : 0);
  const perRow = 2;
  const tileRows = Math.ceil(layout.tiles.length / perRow);
  const tileW = Math.floor((rightW - tileGap) / perRow);
  const tileH = Math.floor((bandH - tileGap * (tileRows - 1)) / tileRows);
  const tileText = sharedBlockText(
    layout.tiles,
    tileW,
    tileH >= 300
      ? { sizes: [26, 24, 22, 20], maxLines: 3 }
      : { sizes: [22, 20, 19, 18], maxLines: 2 }
  );
  return (
    <div style={{ display: "flex", gap: `${GAP}px` }}>
      {photoBlock(layout.lead, leadW, BODY_H, {
        sizes: [36, 34, 32, 30, 28],
        maxLines: 3,
        kickerSize: 15,
      })}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: `${rightW}px`,
          height: `${BODY_H}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: `${tileGap}px`,
            width: `${rightW}px`,
          }}
        >
          {layout.tiles.map((tile) => (
            <div key={tile.rank} style={{ display: "flex" }}>
              {photoBlock(tile, tileW, tileH, tileText)}
            </div>
          ))}
        </div>
        {layout.rows.length ? rowList(layout.rows, rightW, rowsH) : null}
      </div>
    </div>
  );
}

function split(layout: Extract<DayCardLayout, { variant: "split" }>) {
  const w = Math.floor((BODY_W - GAP) / 2);
  const text = sharedBlockText(layout.pair, w, {
    sizes: [36, 34, 32, 30, 28],
    maxLines: 3,
    kickerSize: 15,
  });
  return (
    <div style={{ display: "flex", gap: `${GAP}px` }}>
      {layout.pair.map((story) => (
        <div key={story.rank} style={{ display: "flex" }}>
          {photoBlock(story, w, BODY_H, text)}
        </div>
      ))}
    </div>
  );
}

function single(layout: Extract<DayCardLayout, { variant: "single" }>) {
  const story = layout.lead;
  if (!story.image) return typeLead(story, BODY_W, BODY_H);
  const photoW = 640;
  const textW = BODY_W - photoW - GAP - 8;
  return (
    <div style={{ display: "flex", gap: `${GAP}px` }}>
      <div
        style={{ display: "flex", position: "relative", backgroundColor: INK }}
      >
        {photo(story.image, photoW, BODY_H)}
        {rankFlag(story.rank, 52)}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: "14px",
          width: `${textW}px`,
          height: `${BODY_H}px`,
          paddingBottom: "4px",
        }}
      >
        {kicker(story.kicker, AMBER, 16)}
        {headline(
          story.title,
          {
            width: textW,
            height: BODY_H - 40,
            sizes: [52, 48, 44, 40, 36, 32, 30],
          },
          { color: INK, weight: 700 }
        )}
      </div>
    </div>
  );
}

function empty(lang: Lang, pending: boolean) {
  const { title, note } = EMPTY_COPY[lang][pending ? "pending" : "quiet"];
  const tile = 220;
  const pad = 44;
  const textW = BODY_W - pad * 3 - tile;
  const line = {
    width: textW,
    height: 100,
    sizes: [68, 64, 58, 52],
    maxLines: 1,
  };
  const size = sharedSize(title.map((text) => ({ text, box: line })));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        width: `${BODY_W}px`,
        height: `${BODY_H}px`,
        padding: `${pad}px`,
        backgroundColor: INK,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          width: `${textW}px`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {title.map((text) => (
            <div key={text} style={{ display: "flex" }}>
              {headline(
                text,
                { ...line, sizes: [size] },
                { color: "#ffffff", weight: 700 }
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "26px",
            fontWeight: 500,
            color: YELLOW,
          }}
        >
          {note}
        </div>
      </div>
      {/* The logo's yellow tile and semicolon, the brand's own mark. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: `${tile}px`,
          height: `${tile}px`,
          backgroundColor: YELLOW,
          color: INK,
          fontSize: "180px",
          fontWeight: 700,
          lineHeight: 1,
          paddingBottom: "36px",
        }}
      >
        ;
      </div>
    </div>
  );
}

const BODY: {
  [V in DayCardLayout["variant"]]: (
    layout: Extract<DayCardLayout, { variant: V }>,
    lang: Lang
  ) => ReactNode;
} = {
  empty: (layout, lang) => empty(lang, layout.pending),
  single,
  split,
  "lead-list": leadWithList,
  mosaic,
  headlines: leadWithList,
};

/** Pure renderer shared by the Worker route, tests and the preview script. */
export function dayOgCard(model: DayCardModel): ReactElement {
  const { date, lang, layout } = model;
  const body = (
    BODY[layout.variant] as (l: DayCardLayout, lang: Lang) => ReactNode
  )(layout, lang);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: `${DAY_OG_WIDTH}px`,
        height: `${DAY_OG_HEIGHT}px`,
        backgroundColor: YELLOW,
        color: INK,
        padding: `${PAD}px`,
        fontFamily: "Be Vietnam Pro",
      }}
    >
      {header(date, lang, layoutStories(layout).length)}
      {body}
    </div>
  );
}
