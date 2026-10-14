import {
  BookOpenText,
  CalendarDays,
  Database,
  Globe,
  Info,
  Newspaper,
  Palette,
  Plug,
  Plus,
  Send,
} from "lucide-react";
import type { AriaAttributes, ComponentType } from "react";
import type { Channel, NavTarget } from "../../lib/analytics/events";
import { DUYET_URL, EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
import { ChromeMark } from "./ChromeMark";

// Routes whose content is English-only — the EN|VI toggle is disabled
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

export const SITE_LINKS: {
  /** Static slug sent as `nav_click.to`; never an href. */
  id: NavTarget;
  href: string;
  label: string;
  internal: boolean;
  icon: LinkIcon;
  channel?: Channel;
  /** The channel's audience language, when it has one. */
  channelLang?: Lang;
}[] = [
  { id: "/", href: "/", label: "News", internal: true, icon: Newspaper },
  {
    id: "/weeks",
    href: "/weeks",
    label: "Weekly",
    internal: true,
    icon: BookOpenText,
  },
  {
    id: "/calendar",
    href: "/calendar",
    label: "Calendar",
    internal: true,
    icon: CalendarDays,
  },
  { id: "/about", href: "/about", label: "About", internal: true, icon: Info },
  {
    id: "/brand",
    href: "/brand",
    label: "Brand",
    internal: true,
    icon: Palette,
  },
  { id: "/mcp", href: "/mcp", label: "MCP", internal: true, icon: Plug },
  {
    id: "extension",
    href: EXTENSION_PATH,
    label: "Get AI;DR",
    internal: true,
    icon: ChromeMark,
    channel: "extension",
  },
  {
    id: "telegram",
    href: TELEGRAM_URL,
    label: "Telegram",
    internal: false,
    icon: Send,
    channel: "telegram",
    channelLang: "vi",
  },
  { id: "/data", href: "/data", label: "Data", internal: true, icon: Database },
  {
    id: "/contribute",
    href: "/contribute",
    label: "Contribute",
    internal: true,
    icon: Plus,
  },
  {
    id: "duyet.net",
    href: DUYET_URL,
    label: "duyet.net",
    internal: false,
    icon: Globe,
  },
];
