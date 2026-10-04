import type { ReactElement } from "react";
import { dayCardTileCount, hasDayOgCopy } from "./day-card-pick";
import { localizedTitle } from "./display-title";
import type { StoryOgImage } from "./story-og";
import type { FeedItem, Lang } from "./types";

/**
 * Day card for `/date/YYYY-MM-DD`: the day's top stories as a photo grid
 * (the daily-news video's summary grid, at OG size). Used as the day page's
 * `og:image` and as the Telegram daily digest image.
 */
export const DAY_OG_WIDTH = 1200;
export const DAY_OG_HEIGHT = 630;
/** 3×2 grid; a thin day falls back to 2×2 or one row. */
export const DAY_OG_MAX_TILES = 6;

export function dayOgTileCount(available: number): number {
  return dayCardTileCount(available);
}

const YELLOW = "#f5c518";
const INK = "#0a0a0a";
const CREAM = "#fdf5d8";
const KICKER = "#f5c518";
const KICKER_ON_CREAM = "#b45309";

const PAD = 36;
const GAP = 12;
const HEADER = 92;

export interface DayOgTile {
  title: string;
  kicker: string;
  image: StoryOgImage | null;
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export { hasDayOgCopy };

export function dayOgTile(
  item: FeedItem,
  image: StoryOgImage | null,
  lang: Lang
): DayOgTile {
  return {
    title: clip(localizedTitle(item, lang).text, 120),
    kicker: clip((item.tags[0] ?? item.category ?? "").toUpperCase(), 32),
    image,
  };
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

function tile(t: DayOgTile, index: number, w: number, h: number) {
  const hasImage = Boolean(t.image);
  const titleSize = hasImage ? (w > 400 ? 26 : 21) : w > 400 ? 34 : 28;
  const lines = hasImage ? 2 : 4;
  /** Kicker + clamped title + padding; the photo takes the rest. */
  const textPanel = hasImage ? Math.ceil(titleSize * 1.15 * lines) + 52 : 0;
  return (
    <div
      key={index}
      style={{
        display: "flex",
        position: "relative",
        width: `${w}px`,
        height: `${h}px`,
        overflow: "hidden",
        backgroundColor: hasImage ? INK : CREAM,
      }}
    >
      {t.image ? (
        // Photo on top, solid text panel below: screenshots of other sites
        // carry their own headlines, so nothing is drawn over the image.
        <img
          src={t.image.dataUri}
          alt=""
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${w}px`,
            height: `${h - textPanel}px`,
            objectFit: "cover",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "40px",
          height: "44px",
          backgroundColor: YELLOW,
          color: INK,
          fontSize: "28px",
          fontWeight: 700,
        }}
      >
        {String(index + 1)}
      </div>
      <div
        style={{
          position: "absolute",
          left: "16px",
          right: "16px",
          ...(hasImage
            ? { bottom: "14px" }
            : { top: "56px", bottom: "18px", justifyContent: "flex-end" }),
          display: "flex",
          flexDirection: "column",
          gap: hasImage ? "4px" : "10px",
        }}
      >
        {t.kicker ? (
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "1.5px",
              color: hasImage ? KICKER : KICKER_ON_CREAM,
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {t.kicker}
          </div>
        ) : null}
        <div
          style={{
            fontSize: `${titleSize}px`,
            fontWeight: 500,
            lineHeight: 1.15,
            color: hasImage ? "#ffffff" : INK,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: lines,
            textOverflow: "ellipsis",
            overflow: "hidden",
            maxHeight: `${Math.ceil(titleSize * 1.15 * lines)}px`,
          }}
        >
          {t.title}
        </div>
      </div>
    </div>
  );
}

/** Pure renderer shared by the Worker route and tests. */
export function dayOgCard(
  date: string,
  tiles: DayOgTile[],
  lang: Lang
): ReactElement {
  const parts = dayOgDateParts(date, lang);
  const n = tiles.length;
  const cols = n === 4 ? 2 : Math.max(1, Math.min(3, n));
  const rows = Math.max(1, Math.ceil(n / cols));
  const gridW = DAY_OG_WIDTH - PAD * 2;
  const gridH = DAY_OG_HEIGHT - PAD * 2 - HEADER;
  const w = Math.floor((gridW - GAP * (cols - 1)) / cols);
  const h = Math.floor((gridH - GAP * (rows - 1)) / rows);
  const badge = lang === "vi" ? `TOP ${n} TIN AI` : `TOP ${n} IN AI`;

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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: `${GAP}px`,
          width: `${gridW}px`,
        }}
      >
        {tiles.map((t, i) => tile(t, i, w, h))}
      </div>
    </div>
  );
}
