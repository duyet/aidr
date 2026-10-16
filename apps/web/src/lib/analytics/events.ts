/**
 * Every analytics event the product can send. Each row names who sends it,
 * its params and the product question it answers. `track()`, the GA4
 * custom-dimension list and docs/analytics-events.md all derive from this
 * object. To add an event, add a row with its question; if you cannot write
 * the question, do not add the event.
 */
import type { Metric } from "web-vitals";
import type { ReaderBg, ReaderDensity, TldrCount } from "../prefs";
import {
  count,
  dim,
  itemId,
  label,
  num,
  oneOf,
  opt,
  type ParamsOf,
  path,
  type Spec,
  slug,
} from "./schema";

export type Sender = "browser" | "worker" | "extension";
export type Sink = "ga4" | "posthog";
export const SINKS = ["ga4", "posthog"] as const satisfies readonly Sink[];

export interface EventSpec {
  sender: Sender;
  /** The product question this event answers. */
  question: string;
  params: Record<string, Spec>;
  /** Defaults to every sink. */
  sinks?: readonly Sink[];
}

export const CHANNELS = [
  "extension",
  "telegram",
  "email",
  "facebook",
  "youtube",
  "rss",
  "other",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const PAGE_TYPES = [
  "home",
  "story",
  "day",
  "week",
  "calendar",
  "data",
  "subscribe",
  "about",
  "other",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/**
 * Every internal route or external link id `nav_click.to` may carry. A fixed
 * list, so a typo or a href with a query string fails type-check.
 */
export const NAV_TARGETS = [
  "/",
  "/weeks",
  "/calendar",
  "/about",
  "/brand",
  "/mcp",
  "/data",
  "/data/algo",
  "/data/runs",
  "/contribute",
  "/release",
  "/privacy",
  "/terms",
  "/sign-in",
  "extension",
  "telegram",
  "github",
  "duyet.net",
  "anyrouter.dev",
] as const;
export type NavTarget = (typeof NAV_TARGETS)[number];

const LANGS = ["vi", "en"] as const;
const LINK_PLACEMENTS = [
  "header",
  "header_menu",
  "phone_menu",
  "footer",
  "subscribe_page",
] as const;
/** Mirrors SUBSCRIBE_SOURCES in worker/subscribe/handlers.ts (test-enforced). */
export const SUBSCRIBE_SOURCES = ["news", "extension"] as const;

const ON_OFF = ["on", "off"] as const;
const NO_VALUE = [] as const;
const READER_BGS = [
  "default",
  "cream",
  "gray",
  "dark",
  "black",
] as const satisfies readonly ReaderBg[];
const READER_DENSITIES = [
  "dense",
  "compact",
  "medium",
  "comfortable",
  "relaxed",
  "spacious",
  "airy",
] as const satisfies readonly ReaderDensity[];
const TLDR_COUNTS = [
  "8",
  "12",
  "16",
] as const satisfies readonly `${TldrCount}`[];

/**
 * Each reader setting and the values `prefs_change` may report for it. An
 * empty list means the setting has no enum value to report (fontSize is a
 * continuous scale, reset has none).
 */
export const PREF_VALUES = {
  bg: READER_BGS,
  theme: ["light", "dark"],
  font: ["sans", "serif"],
  fontSize: NO_VALUE,
  density: READER_DENSITIES,
  reset: NO_VALUE,
  tldrCount: TLDR_COUNTS,
  bilingualDialog: ON_OFF,
  "sections.trending": ON_OFF,
  "sections.tldr": ON_OFF,
  "sections.days": ON_OFF,
  "sections.categories": ON_OFF,
} as const satisfies Record<string, readonly string[]>;
type PrefName = keyof typeof PREF_VALUES;
type PrefValue = (typeof PREF_VALUES)[PrefName][number];
const PREF_NAMES = Object.keys(PREF_VALUES) as PrefName[];
const ALL_PREF_VALUES = [
  ...new Set(Object.values(PREF_VALUES).flat()),
] as PrefValue[];

export const EVENTS = {
  page_view: {
    sender: "browser",
    // PostHog captures its own $pageview on load and on history changes
    // (posthog-js `defaults` >= 2025-05-24), so this goes to GA4 only.
    sinks: ["ga4"],
    question: "Which pages and page types do readers reach?",
    params: { page_path: path(), page_type: dim(oneOf(PAGE_TYPES)) },
  },
  channel_landing: {
    sender: "browser",
    question:
      "Which channel, campaign and slot brings readers in, and to which page?",
    params: {
      channel: dim(oneOf(CHANNELS)),
      page_type: dim(oneOf(PAGE_TYPES)),
      page_path: path(),
      utm_medium: opt(slug()),
      utm_campaign: opt(slug()),
      utm_content: opt(slug()),
    },
  },
  nav_click: {
    sender: "browser",
    question:
      "`to` is one of `NAV_TARGETS` (route path like `/weeks`, or a bare name like `github`, never an href or query). Which navigation links get used, from which placement?",
    params: { to: oneOf(NAV_TARGETS), placement: dim(oneOf(LINK_PLACEMENTS)) },
  },
  channel_click: {
    sender: "browser",
    question: "Which follow or install CTA, in which placement, gets clicked?",
    params: {
      channel: dim(oneOf(CHANNELS)),
      placement: dim(oneOf(LINK_PLACEMENTS)),
      lang: opt(dim(oneOf(LANGS))),
    },
  },
  topic_filter: {
    sender: "browser",
    question: "Which topics do readers filter by, and from where?",
    params: {
      tag: label(),
      from: dim(oneOf(["nav", "trending", "search"])),
    },
  },
  search: {
    sender: "browser",
    question: "Do readers run a full search?",
    params: { query_len: count() },
  },
  tldr_toggle: {
    sender: "browser",
    question: "Do readers prefer the image or the text TL;DR?",
    params: { view: dim(oneOf(["image", "text"])) },
  },
  calendar_open: {
    sender: "browser",
    question: "Do readers browse past editions?",
    params: { placement: dim(oneOf(["popover", "sheet"])) },
  },
  intro_video_open: {
    sender: "browser",
    question: "Does the intro video get opened?",
    params: { placement: dim(oneOf(["header", "phone_menu"])) },
  },
  story_view: {
    sender: "browser",
    question: "Which stories get opened, how, and on which page?",
    params: {
      item_id: itemId(),
      via: dim(oneOf(["row"])),
      page_type: dim(oneOf(PAGE_TYPES)),
    },
  },
  source_click: {
    sender: "browser",
    question: "Is the summary enough, or do readers go to the source?",
    params: {
      item_id: itemId(),
      placement: dim(oneOf(["row", "dialog", "sources"])),
    },
  },
  media_open: {
    sender: "browser",
    question: "Is story media worth its bytes?",
    params: {
      item_id: opt(itemId()),
      media: dim(oneOf(["thumb", "image", "video"])),
      index: opt(count()),
    },
  },
  prefs_change: {
    sender: "browser",
    question: "Which reader settings get changed, and to what?",
    params: {
      pref: dim(oneOf(PREF_NAMES)),
      pref_value: opt(dim(oneOf(ALL_PREF_VALUES))),
    },
  },
  lang_change: {
    sender: "browser",
    question: "How often do readers switch language, and to which?",
    params: { lang: dim(oneOf(LANGS)) },
  },
  subscribe_submit: {
    sender: "browser",
    question: "Who starts an email signup, from which form?",
    params: { source: dim(oneOf(SUBSCRIBE_SOURCES)) },
  },
  subscribe_success: {
    sender: "browser",
    question: "Which forms turn into a signup request?",
    params: { source: dim(oneOf(SUBSCRIBE_SOURCES)) },
  },
  subscribe_error: {
    sender: "browser",
    question: "Why do signups fail?",
    params: {
      source: dim(oneOf(SUBSCRIBE_SOURCES)),
      reason: dim(oneOf(["invalid", "rate_limited", "network", "server"])),
    },
  },
  web_vitals: {
    sender: "browser",
    question: "Are Core Web Vitals healthy, by edge cache state?",
    params: {
      metric_name: dim(oneOf(["LCP", "CLS", "INP", "FCP", "TTFB"])),
      // GA4 sums `value`; CLS is sent x1000 so it survives rounding.
      value: count(),
      metric_value: num(),
      metric_rating: dim(oneOf(["good", "needs-improvement", "poor"])),
      metric_id: opt(slug()),
      navigation_type: oneOf([
        "navigate",
        "reload",
        "back-forward",
        "back-forward-cache",
        "prerender",
        "restore",
        "soft-navigation",
      ] as const satisfies readonly Metric["navigationType"][]),
      edge_cache: dim(oneOf(["HIT", "STALE", "KV", "MISS", "none"])),
      page_path: path(),
    },
  },
} as const satisfies Record<string, EventSpec>;

export const EXTENSION_CHANNELS = ["chrome", "telegram", "email"] as const;

/**
 * Events the Chrome extension's new tab sends (`apps/extension/js/track.js`).
 * It has no analytics SDK (privacy policy). Each event is one GET to
 * `/api/extension`, tagged `ref=extension` and `utm_*`, with the event name
 * and its params joined into `utm_content` (`trackContent`). The route
 * ignores the query and answers the release JSON, so these show only in
 * Cloudflare request logs, never in GA4 or PostHog. Names match the web rows
 * where the question is the same; the param sets are the extension's own.
 */
export const EXTENSION_EVENTS = {
  page_view: {
    sender: "extension",
    sinks: [],
    question: "How often is the extension's new tab opened?",
    params: {},
  },
  lang_change: {
    sender: "extension",
    sinks: [],
    question: "How often do new-tab readers switch language, and to which?",
    params: { lang: oneOf(LANGS) },
  },
  prefs_change: {
    sender: "extension",
    sinks: [],
    // `to` is `pref_value` on the web row; the extension keeps its own name.
    question: "Which new-tab sections do readers turn on or off?",
    params: {
      pref: oneOf(["categories", "trending", "tldr", "days"]),
      to: oneOf(ON_OFF),
    },
  },
  channel_click: {
    sender: "extension",
    sinks: [],
    question: "Which follow or install link on the new tab gets clicked?",
    params: { channel: oneOf(EXTENSION_CHANNELS), to: slug() },
  },
} as const satisfies Record<string, EventSpec>;

type Events = typeof EVENTS;
export type EventName = keyof Events;
export type BrowserEventName = {
  [K in EventName]: Events[K]["sender"] extends "browser" ? K : never;
}[EventName];

/** prefs_change ties each value to its setting, which a flat spec cannot. */
type PrefChangeParams = {
  [P in PrefName]: (typeof PREF_VALUES)[P] extends readonly []
    ? { pref: P }
    : { pref: P; pref_value: (typeof PREF_VALUES)[P][number] };
}[PrefName];

type ParamOverrides = { prefs_change: PrefChangeParams };

export type EventParams<N extends EventName> = N extends keyof ParamOverrides
  ? ParamOverrides[N]
  : ParamsOf<Events[N]["params"]>;

export function isEventName(name: string): name is EventName {
  return Object.hasOwn(EVENTS, name);
}
