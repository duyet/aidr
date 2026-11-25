import "./preview-shim.js";
import {
  DEFAULT_THEME,
  DEFAULT_TLDR_VIEW,
  normalizeTldrView,
  TLDR_VIEWS,
} from "./shared/reader-view.js";

export const DEFAULT_API_BASE = "https://aidr.today";

/** Allow only https: (or http: loopback) URLs for href/src from API data. */
export function safeHttpUrl(value, fallback = "") {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) {
      return url.href;
    }
  } catch {
    // ignore
  }
  return fallback;
}

const DEFAULT_SECTION_ORDER = ["categories", "trending", "tldr", "days"];

/** Reader choice lists — kept in sync with apps/web/src/lib/prefs.ts. */
export const LAYOUTS = ["compact", "comfortable", "newspaper"];
export const ACCENTS = ["yellow", "blue", "green", "rose", "violet"];
export const HIGHLIGHTS = ["topic", "one", "none"];
export const BILINGUAL_FIRSTS = ["vi", "en"];
export const TLDR_COLS = [1, 2, 3];
export { TLDR_VIEWS };
export const NEWS_COLS = [2, 3];
export const FEED_DAYS = [1, 3, 7];

export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME,
  font: "sans",
  fontSize: 1,
  language: "vi",
  bg: "default",
  sections: {
    trending: true,
    tldr: true,
    days: true,
    categories: true,
  },
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  /** Matches the web reader's medium rhythm. All seven steps still load. */
  density: "medium",
  storyCount: 8,
  tldrCount: 8,
  /** Show EN|VI side-by-side in the story dialog (matches web bilingualDialog pref). */
  bilingualDialog: false,
  /** Footer is hidden by default on new tab for a cleaner digest-first layout. */
  showFooter: false,
  apiBase: DEFAULT_API_BASE,
  // Reader prefs shared with the website's Customize panel.
  /** Body font is `font` above; `headFont` sets headlines apart. */
  headFont: "sans",
  layout: "compact",
  accent: "yellow",
  highlight: "topic",
  /** Show the other language under the leading one. */
  bilingual: false,
  bilingualFirst: "vi",
  tldrCols: 2,
  /** Image / 2 rows / 3 rows masthead choice; persisted from the toggle. */
  tldrView: DEFAULT_TLDR_VIEW,
  thumbs: false,
  summaries: false,
  /** Vote arrows and counts in ranked rows. */
  votes: false,
  /** The right column: trending, newsletter, Telegram, this week. */
  rail: true,
  feedDays: 3,
  newsCols: 2,
};

const SYNC_KEY = "newsTabSettings";
const FONTS = ["sans", "serif"];
const LEGACY_FONTS = ["system", "editorial", "humanist", "mono"];
const THEMES = ["light", "dark", "system"];
const BGS = ["default", "cream", "gray", "dark", "black"];
/** Tight → airy, in slider order. Matches web READER_DENSITIES. */
export const DENSITIES = [
  "dense",
  "compact",
  "medium",
  "comfortable",
  "relaxed",
  "spacious",
  "airy",
];
const LANGUAGES = ["vi", "en", "both"];
const TLDR_COUNTS = [8, 12, 16];
const FONT_SIZE_MIN = 0.85;
const FONT_SIZE_MAX = 1.25;

function asChrome() {
  return globalThis.chrome;
}

/** Scale factor (0.85–1.25). Legacy px values (13–20) migrate via /16. */
export function clampFontSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.fontSize;
  const scale = n > 2 ? n / 16 : n;
  const stepped = Math.round(scale * 20) / 20;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, stepped));
}

function clampCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.storyCount;
  return Math.min(8, Math.max(1, Math.round(n)));
}

function clampTldrCount(value) {
  const n = Number(value);
  return TLDR_COUNTS.includes(n) ? n : DEFAULT_SETTINGS.tldrCount;
}

function pick(list, value, fallback) {
  return list.includes(value) ? value : fallback;
}

function flag(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFont(value) {
  if (FONTS.includes(value)) return value;
  if (LEGACY_FONTS.includes(value)) return "sans";
  return DEFAULT_SETTINGS.font;
}

function normalizeSectionOrder(value) {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.sectionOrder];
  const valid = DEFAULT_SETTINGS.sectionOrder;
  const filtered = value.filter((k) => valid.includes(k));
  return [...filtered, ...valid.filter((k) => !filtered.includes(k))];
}

export function normalizeSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const sections =
    input.sections && typeof input.sections === "object" ? input.sections : {};
  return {
    theme: pick(THEMES, input.theme, DEFAULT_SETTINGS.theme),
    font: normalizeFont(input.font),
    headFont: normalizeFont(input.headFont),
    fontSize: clampFontSize(input.fontSize),
    language: pick(LANGUAGES, input.language, DEFAULT_SETTINGS.language),
    bg: pick(BGS, input.bg, DEFAULT_SETTINGS.bg),
    sections: {
      tldr: flag(sections.tldr, DEFAULT_SETTINGS.sections.tldr),
      // `stories` was the old key for the ranked day list.
      days: flag(
        sections.days ?? sections.stories,
        DEFAULT_SETTINGS.sections.days
      ),
      categories: flag(
        sections.categories,
        DEFAULT_SETTINGS.sections.categories
      ),
      trending: flag(sections.trending, DEFAULT_SETTINGS.sections.trending),
    },
    sectionOrder: normalizeSectionOrder(input.sectionOrder),
    density: pick(DENSITIES, input.density, DEFAULT_SETTINGS.density),
    storyCount: clampCount(input.storyCount),
    tldrCount: clampTldrCount(input.tldrCount),
    showFooter: input.showFooter === true,
    bilingualDialog: input.bilingualDialog === true,
    apiBase: normalizeApiBase(input.apiBase),
    layout: pick(LAYOUTS, input.layout, DEFAULT_SETTINGS.layout),
    accent: pick(ACCENTS, input.accent, DEFAULT_SETTINGS.accent),
    highlight: pick(HIGHLIGHTS, input.highlight, DEFAULT_SETTINGS.highlight),
    bilingual: flag(input.bilingual, DEFAULT_SETTINGS.bilingual),
    bilingualFirst: pick(
      BILINGUAL_FIRSTS,
      input.bilingualFirst,
      DEFAULT_SETTINGS.bilingualFirst
    ),
    tldrCols: pick(TLDR_COLS, input.tldrCols, DEFAULT_SETTINGS.tldrCols),
    tldrView: normalizeTldrView(input.tldrView),
    thumbs: flag(input.thumbs, DEFAULT_SETTINGS.thumbs),
    summaries: flag(input.summaries, DEFAULT_SETTINGS.summaries),
    votes: flag(input.votes, DEFAULT_SETTINGS.votes),
    rail: flag(input.rail, DEFAULT_SETTINGS.rail),
    feedDays: pick(FEED_DAYS, input.feedDays, DEFAULT_SETTINGS.feedDays),
    newsCols: pick(NEWS_COLS, input.newsCols, DEFAULT_SETTINGS.newsCols),
  };
}

/** Unpacked/dev keeps the API base field; CWS store flavor hides it. */
export function allowCustomApiBase(manifest) {
  if (manifest == null) return true;
  const optional = manifest.optional_host_permissions;
  if (!Array.isArray(optional)) return false;
  return optional.some(
    (origin) =>
      typeof origin === "string" &&
      (origin.includes("localhost") || origin.includes("127.0.0.1"))
  );
}

export function normalizeApiBase(value) {
  const fallback = DEFAULT_API_BASE;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    const loopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && loopback)) {
      return `${url.protocol}//${url.host}`;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function prefersDark() {
  return Boolean(
    globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

/** Resolved dark mode — bg swatches dark/black win over theme. */
export function isDarkAppearance(settings) {
  if (settings.bg === "dark" || settings.bg === "black") return true;
  if (settings.bg === "cream" || settings.bg === "gray") return false;
  if (settings.theme === "dark") return true;
  if (settings.theme === "light") return false;
  return prefersDark();
}

export function applyAppearance(settings) {
  const root = document.documentElement;
  const dark = isDarkAppearance(settings);
  root.dataset.theme = settings.theme;
  root.dataset.font = settings.font;
  root.dataset.density = settings.density;
  root.classList.toggle("dark", dark);
  root.style.setProperty("--size", `calc(16px * ${settings.fontSize})`);
  root.style.setProperty("--reader-font-size", String(settings.fontSize));
  root.lang = settings.language === "en" ? "en" : "vi";

  const shell = document.querySelector(".app-shell");
  if (shell instanceof HTMLElement) {
    const onOff = (value) => (value ? "on" : "off");
    // Exact hooks the website styles.css keys page-wide rules off. Other
    // owners wire the new markup/CSS; this only publishes the resolved prefs.
    shell.dataset.readerBg = settings.bg;
    shell.dataset.layout = settings.layout;
    shell.dataset.accent = settings.accent;
    shell.dataset.highlight = settings.highlight;
    shell.dataset.headFont = settings.headFont;
    shell.dataset.bilingual = onOff(settings.bilingual);
    shell.dataset.tldrCols = String(settings.tldrCols);
    shell.dataset.newsCols = String(settings.newsCols);
    shell.dataset.thumbs = onOff(settings.thumbs);
    shell.dataset.summaries = onOff(settings.summaries);
    shell.dataset.rail = onOff(settings.rail);
  }

  const feed = document.querySelector(".news-content");
  if (feed instanceof HTMLElement) {
    feed.dataset.readerFont = settings.font;
  }
}

async function areaGet(area, key) {
  const chromeApi = asChrome();
  const bag = await chromeApi.storage[area].get(key);
  return bag?.[key];
}

async function areaSet(area, key, value) {
  const chromeApi = asChrome();
  await chromeApi.storage[area].set({ [key]: value });
}

export async function loadSettings() {
  try {
    const fromSync = await areaGet("sync", SYNC_KEY);
    if (fromSync) return normalizeSettings(fromSync);
  } catch {
    // sync quota / private mode
  }
  try {
    const fromLocal = await areaGet("local", SYNC_KEY);
    if (fromLocal) return normalizeSettings(fromLocal);
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS, sections: { ...DEFAULT_SETTINGS.sections } };
}

export async function saveSettings(next) {
  const settings = normalizeSettings(next);
  try {
    await areaSet("sync", SYNC_KEY, settings);
  } catch {
    // fall through to local
  }
  await areaSet("local", SYNC_KEY, settings);
  applyAppearance(settings);
  return settings;
}

/**
 * Persist a partial patch from the renderer (e.g. the day-card image/text
 * toggle calling `updateSettings({ tldrView: "image" })`). Loads the current
 * value first so callers don't need to hold the whole settings object.
 */
export async function updateSettings(patch) {
  const current = await loadSettings();
  return saveSettings({ ...current, ...patch });
}

export async function ensureHostPermission(apiBase) {
  const chromeApi = asChrome();
  const origin = `${normalizeApiBase(apiBase)}/*`;
  if (origin.startsWith("https://aidr.today/")) return true;
  if (!chromeApi.permissions?.request) return true;
  const already = await chromeApi.permissions.contains({ origins: [origin] });
  if (already) return true;
  return chromeApi.permissions.request({ origins: [origin] });
}
