import {
  BookOpenText,
  CalendarDays,
  Database,
  Globe,
  House,
  Info,
  Palette,
  Plug,
  Plus,
  Rocket,
  Rss,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { AriaAttributes, ComponentType } from "react";
import type { Channel, NavTarget } from "../../lib/analytics/events";
import { track } from "../../lib/analytics/track";
import {
  DUYET_URL,
  EXTENSION_PATH,
  FACEBOOK_URL,
  TELEGRAM_EN_HANDLE,
  TELEGRAM_EN_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../../lib/site";
import type { Lang } from "../../lib/types";
import { ChromeMark } from "./ChromeMark";
import { FacebookMark } from "./FacebookMark";

// Routes whose content is English-only — the language switch is disabled
// while on one of these, rather than offering a translation that doesn't
// exist.
export const LANG_TOGGLE_DISABLED_PATHS = new Set([
  "/data",
  "/about",
  "/brand",
  "/mail",
  "/privacy",
  "/terms",
  "/sign-in",
  "/sign-up",
]);

export function isLangToggleDisabledPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    LANG_TOGGLE_DISABLED_PATHS.has(path) ||
    path.startsWith("/sign-in/") ||
    path.startsWith("/sign-up/")
  );
}

type LinkIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: AriaAttributes["aria-hidden"];
}>;

export type LinkPlacement =
  | "header"
  | "header_menu"
  | "phone_menu"
  | "footer"
  | "tab_bar"
  | "story_end"
  | "home_rail";

/** What a click reports: a follow channel, or a navigation target. */
type LinkTrack = { channel: Channel; lang?: Lang } | { to: NavTarget };

export interface SiteLink {
  key: string;
  /** A route path, or an absolute URL that opens in a new tab. */
  href: string;
  search?: Record<string, string>;
  vi: string;
  en: string;
  /** A short second line, like the Telegram handle. */
  hint?: { vi: string; en: string };
  icon: LinkIcon;
  track: LinkTrack;
}

export function isExternal(link: SiteLink): boolean {
  return link.href.startsWith("http");
}

export function trackLink(link: SiteLink, placement: LinkPlacement) {
  if ("channel" in link.track) {
    track("channel_click", {
      channel: link.track.channel,
      placement,
      ...(link.track.lang ? { lang: link.track.lang } : {}),
    });
  } else {
    track("nav_click", { to: link.track.to, placement });
  }
}

/** Today, Weeks and Calendar: the header nav and the phone tab bar. */
export const NAV_ITEMS = [
  { id: "/", href: "/", vi: "Hôm nay", en: "Today", icon: House },
  { id: "/weeks", href: "/weeks", vi: "Tuần", en: "Weeks", icon: BookOpenText },
  {
    id: "/calendar",
    href: "/calendar",
    vi: "Lịch",
    en: "Calendar",
    icon: CalendarDays,
  },
] as const satisfies readonly {
  id: NavTarget;
  href: string;
  vi: string;
  en: string;
  icon: LinkIcon;
}[];

/** Where to follow AI;DR, after the email field. Telegram is the channel in
 *  the reader's language: @aihomnay for VI, @aidr_today for EN. */
export function followLinks(lang: Lang): SiteLink[] {
  const handle = lang === "vi" ? TELEGRAM_HANDLE : TELEGRAM_EN_HANDLE;
  return [
    {
      key: "telegram",
      href: lang === "vi" ? TELEGRAM_URL : TELEGRAM_EN_URL,
      vi: "Telegram",
      en: "Telegram",
      hint: { vi: handle, en: handle },
      icon: Send,
      track: { channel: "telegram", lang },
    },
    {
      key: "facebook",
      href: FACEBOOK_URL,
      vi: "Facebook",
      en: "Facebook",
      hint: { vi: "Trang tiếng Anh", en: "English Page" },
      icon: FacebookMark,
      track: { channel: "facebook", lang: "en" },
    },
    {
      key: "extension",
      href: EXTENSION_PATH,
      vi: "Chrome",
      en: "Chrome",
      hint: { vi: "Tin AI trên tab mới", en: "AI news on a new tab" },
      icon: ChromeMark,
      track: { channel: "extension" },
    },
    {
      key: "mcp",
      href: "/mcp",
      vi: "MCP server",
      en: "MCP server",
      hint: { vi: "Cho trợ lý AI", en: "For AI assistants" },
      icon: Plug,
      track: { to: "/mcp" },
    },
    {
      key: "rss",
      href: "/subscribe",
      search: { tab: "rss" },
      vi: "RSS",
      en: "RSS",
      hint: { vi: "Cho trình đọc tin", en: "For feed readers" },
      icon: Rss,
      track: { channel: "rss" },
    },
  ];
}

/** The site pages the phone menu lists under the follow links. */
export const SITE_LINKS = [
  { id: "/about", href: "/about", vi: "Giới thiệu", en: "About", icon: Info },
  {
    id: "/release",
    href: "/release",
    vi: "Phát hành",
    en: "Release",
    icon: Rocket,
  },
  { id: "/data", href: "/data", vi: "Dữ liệu", en: "Data", icon: Database },
  {
    id: "/privacy",
    href: "/privacy",
    vi: "Quyền riêng tư",
    en: "Privacy",
    icon: ShieldCheck,
  },
  {
    id: "/brand",
    href: "/brand",
    vi: "Thương hiệu",
    en: "Brand",
    icon: Palette,
  },
  {
    id: "/contribute",
    href: "/contribute",
    vi: "Đóng góp",
    en: "Contribute",
    icon: Plus,
  },
  {
    id: "duyet.net",
    href: DUYET_URL,
    vi: "duyet.net",
    en: "duyet.net",
    icon: Globe,
  },
] as const satisfies readonly {
  id: NavTarget;
  href: string;
  vi: string;
  en: string;
  icon: LinkIcon;
}[];

export function siteLink(page: (typeof SITE_LINKS)[number]): SiteLink {
  return { ...page, key: page.id, track: { to: page.id } };
}
