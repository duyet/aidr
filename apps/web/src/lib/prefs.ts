import {
  DEFAULT_TLDR_VIEW,
  TLDR_VIEWS,
  type TldrView,
} from "@aidr/libs/reader-view";
import { createContext, useContext } from "react";

export type ReaderFont = "sans" | "serif";
export type ReaderDensity =
  | "dense"
  | "compact"
  | "medium"
  | "comfortable"
  | "relaxed"
  | "spacious"
  | "airy";

/** Slider order, tightest → loosest. */
export const READER_DENSITIES: ReaderDensity[] = [
  "dense",
  "compact",
  "medium",
  "comfortable",
  "relaxed",
  "spacious",
  "airy",
];
export type ReaderBg = "default" | "cream" | "gray" | "dark" | "black";
export type TldrCount = 8 | 12 | 16;

export const READER_FONTS = [
  "sans",
  "serif",
] as const satisfies readonly ReaderFont[];
export const READER_BGS = [
  "default",
  "cream",
  "gray",
  "dark",
  "black",
] as const satisfies readonly ReaderBg[];
export const TLDR_COUNTS = [8, 12, 16] as const satisfies readonly TldrCount[];

/** Page layout: the default dense list, a roomier list, or the print look. */
export const LAYOUTS = ["compact", "comfortable", "newspaper"] as const;
export type Layout = (typeof LAYOUTS)[number];

/** Recolors the logo mark, links and focus ring only. */
export const ACCENTS = ["yellow", "blue", "green", "rose", "violet"] as const;
export type Accent = (typeof ACCENTS)[number];

/** Key-name color: each topic's own ink, the accent for all, or plain text. */
export const HIGHLIGHTS = ["topic", "one", "none"] as const;
export type Highlight = (typeof HIGHLIGHTS)[number];

/** Which language leads when the page shows VI and EN together. */
export const BILINGUAL_FIRSTS = ["vi", "en"] as const;
export type BilingualFirst = (typeof BILINGUAL_FIRSTS)[number];

export const TLDR_COLS = [1, 2, 3] as const;
export type TldrCols = (typeof TLDR_COLS)[number];

/** The AI;DR card views live in @aidr/libs/reader-view, shared with the
 *  Chrome extension. */
export { TLDR_VIEWS, type TldrView };

/** Columns of the ranked list in the newspaper layout. */
export const NEWS_COLS = [2, 3] as const;
export type NewsCols = (typeof NEWS_COLS)[number];

/** Days the home feed shows before "Older days". */
export const FEED_DAYS = [1, 3, 7] as const;
export type FeedDays = (typeof FEED_DAYS)[number];

export type SectionKey = "trending" | "tldr" | "days" | "categories";

export interface ReaderSections {
  trending: boolean;
  tldr: boolean;
  days: boolean;
  categories: boolean;
}

export interface Prefs {
  /** Body font. */
  font: ReaderFont;
  /** Headline font, set apart from the body font. */
  headFont: ReaderFont;
  fontSize: number;
  density: ReaderDensity;
  bg: ReaderBg;
  sections: ReaderSections;
  /** Ordered list of section keys; drives on-page section ordering. */
  sectionOrder: SectionKey[];
  tldrCount: TldrCount;
  /** Remembers the StoryDialog's EN|VI side-by-side toggle across stories. */
  bilingualDialog: boolean;
  layout: Layout;
  accent: Accent;
  highlight: Highlight;
  bilingualFirst: BilingualFirst;
  /** Show the other language under the leading one. */
  bilingual: boolean;
  tldrCols: TldrCols;
  tldrView: TldrView;
  newsCols: NewsCols;
  thumbs: boolean;
  /** Vote counts in ranked-list rows (an open story always shows them). */
  votes: boolean;
  /** The home page's right column: trending, newsletter, Telegram, this week. */
  sidebar: boolean;
  /** Summary lines under ranked-list titles. */
  summaries: boolean;
  feedDays: FeedDays;
  /** Load older days when the end of the feed scrolls into view. */
  infiniteDays: boolean;
}

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "categories",
  "trending",
  "tldr",
  "days",
];

export const DEFAULT_PREFS: Prefs = {
  font: "sans",
  fontSize: 1,
  density: "medium",
  bg: "default",
  sections: { trending: true, tldr: true, days: true, categories: true },
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  tldrCount: 8,
  bilingualDialog: false,
  headFont: "sans",
  layout: "compact",
  accent: "yellow",
  highlight: "topic",
  bilingualFirst: "vi",
  bilingual: false,
  tldrCols: 2,
  tldrView: DEFAULT_TLDR_VIEW,
  newsCols: 2,
  thumbs: false,
  votes: false,
  sidebar: true,
  summaries: false,
  feedDays: 3,
  infiniteDays: false,
};

const STORAGE_KEY = "news_prefs";
const FONT_SIZE_MIN = 0.85;
const FONT_SIZE_MAX = 1.25;

/** The values each enumerated pref may take; anything else loads as default. */
const PREF_CHOICES = {
  font: READER_FONTS,
  headFont: READER_FONTS,
  bg: READER_BGS,
  density: READER_DENSITIES,
  tldrCount: TLDR_COUNTS,
  layout: LAYOUTS,
  accent: ACCENTS,
  highlight: HIGHLIGHTS,
  bilingualFirst: BILINGUAL_FIRSTS,
  tldrCols: TLDR_COLS,
  tldrView: TLDR_VIEWS,
  newsCols: NEWS_COLS,
  feedDays: FEED_DAYS,
} as const satisfies { [K in keyof Prefs]?: readonly Prefs[K][] };

type ChoicePref = keyof typeof PREF_CHOICES;
type FlagPref = {
  [K in keyof Prefs]: Prefs[K] extends boolean ? K : never;
}[keyof Prefs];

function choice<K extends ChoicePref>(
  saved: Record<string, unknown>,
  key: K
): Prefs[K] {
  const allowed: readonly unknown[] = PREF_CHOICES[key];
  return allowed.includes(saved[key])
    ? (saved[key] as Prefs[K])
    : DEFAULT_PREFS[key];
}

function flag(saved: Record<string, unknown>, key: FlagPref): boolean {
  const value = saved[key];
  return typeof value === "boolean" ? value : DEFAULT_PREFS[key];
}

function clampFontSize(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_PREFS.fontSize;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n));
}

/** Parses a stored `news_prefs` value. Keys saved by older builds keep their
 * values, missing keys take defaults, and unknown keys are dropped. */
export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (typeof saved !== "object" || saved === null) return DEFAULT_PREFS;
  const s = saved as Record<string, unknown>;
  const order = Array.isArray(s.sectionOrder)
    ? (s.sectionOrder as unknown[]).filter(
        (k): k is SectionKey =>
          typeof k === "string" && k in DEFAULT_PREFS.sections
      )
    : null;
  // Merge persisted order with any new default keys — keep existing order,
  // append any keys that weren't in the saved value.
  const sectionOrder: SectionKey[] = order
    ? [
        ...order.filter((k) => DEFAULT_SECTION_ORDER.includes(k)),
        ...DEFAULT_SECTION_ORDER.filter((k) => !order.includes(k)),
      ]
    : [...DEFAULT_SECTION_ORDER];
  const sections =
    typeof s.sections === "object" && s.sections !== null
      ? (s.sections as Partial<ReaderSections>)
      : {};
  return {
    font: choice(s, "font"),
    headFont: choice(s, "headFont"),
    fontSize: clampFontSize(s.fontSize),
    density: choice(s, "density"),
    bg: choice(s, "bg"),
    sections: { ...DEFAULT_PREFS.sections, ...sections },
    sectionOrder,
    tldrCount: choice(s, "tldrCount"),
    bilingualDialog: flag(s, "bilingualDialog"),
    bilingual: flag(s, "bilingual"),
    layout: choice(s, "layout"),
    accent: choice(s, "accent"),
    highlight: choice(s, "highlight"),
    bilingualFirst: choice(s, "bilingualFirst"),
    tldrCols: choice(s, "tldrCols"),
    tldrView: choice(s, "tldrView"),
    newsCols: choice(s, "newsCols"),
    thumbs: flag(s, "thumbs"),
    votes: flag(s, "votes"),
    sidebar: flag(s, "sidebar"),
    summaries: flag(s, "summaries"),
    feedDays: choice(s, "feedDays"),
    infiniteDays: flag(s, "infiniteDays"),
  };
}

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    return parsePrefs(localStorage.getItem(STORAGE_KEY));
  } catch {
    // storage unavailable (private mode, blocked) — fall back to defaults
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable (private mode) — prefs just won't persist
  }
}

const DENSITY_PAD: Record<ReaderDensity, string> = {
  dense: "0.375rem",
  compact: "0.5rem",
  medium: "0.625rem",
  comfortable: "0.75rem",
  relaxed: "0.9rem",
  spacious: "1.125rem",
  airy: "1.375rem",
};

/** Maps density → shadcn/typeset rhythm (leading + block flow). */
const DENSITY_TYPESET: Record<
  ReaderDensity,
  { leading: string; leadingDark: string; flow: string }
> = {
  dense: { leading: "1.45", leadingDark: "1.55", flow: "0.8em" },
  compact: { leading: "1.55", leadingDark: "1.65", flow: "0.95em" },
  medium: { leading: "1.62", leadingDark: "1.72", flow: "1.1em" },
  comfortable: { leading: "1.7", leadingDark: "1.8", flow: "1.25em" },
  relaxed: { leading: "1.8", leadingDark: "1.9", flow: "1.4em" },
  spacious: { leading: "1.9", leadingDark: "2", flow: "1.6em" },
  airy: { leading: "2", leadingDark: "2.1", flow: "1.85em" },
};

export function readerCssVars(prefs: Prefs): Record<string, string> {
  const rhythm = DENSITY_TYPESET[prefs.density];
  return {
    "--reader-font-size": String(clampFontSize(prefs.fontSize)),
    "--reader-pad": DENSITY_PAD[prefs.density],
    "--reader-leading": rhythm.leading,
    "--reader-leading-dark": rhythm.leadingDark,
    "--reader-flow": rhythm.flow,
  };
}

const onOff = (value: boolean) => (value ? "on" : "off");

/** The `data-*` hooks on `.app-shell` that styles.css keys page-wide rules
 * off (layout, accent, topic highlight, columns, row details, fonts). */
export function readerDataAttrs(
  prefs: Prefs
): Record<`data-${string}`, string> {
  return {
    "data-reader-bg": prefs.bg,
    "data-layout": prefs.layout,
    "data-accent": prefs.accent,
    "data-highlight": prefs.highlight,
    "data-tldr-cols": String(prefs.tldrCols),
    "data-news-cols": String(prefs.newsCols),
    "data-thumbs": onOff(prefs.thumbs),
    "data-summaries": onOff(prefs.summaries),
    "data-head-font": prefs.headFont,
    "data-bilingual": onOff(prefs.bilingual),
  };
}

/**
 * Sync next-themes' dark/light class + localStorage for the "dark"/"black"
 * swatches. next-themes only reacts to `storage` events fired from OTHER
 * tabs, so a synthetic one is dispatched to keep its own toggle in sync
 * within this tab too.
 */
export function applyReaderTheme(bg: ReaderBg): void {
  if (typeof document === "undefined") return;
  const wantsDark = bg === "dark" || bg === "black";
  const next = wantsDark ? "dark" : "light";
  document.documentElement.classList.toggle("dark", wantsDark);
  try {
    localStorage.setItem("theme", next);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", newValue: next })
    );
  } catch {
    // ignore
  }
}

export interface PrefsContextValue {
  prefs: Prefs;
  setPrefs: (update: Partial<Prefs>) => void;
}

export const PrefsContext = createContext<PrefsContextValue>({
  prefs: DEFAULT_PREFS,
  setPrefs: () => {},
});

export function usePrefs(): PrefsContextValue {
  return useContext(PrefsContext);
}
