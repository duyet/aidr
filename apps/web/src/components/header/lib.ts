import type { TrackChannel } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import {
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
import { DUYET_URL, EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";

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
  href: string;
  label: string;
  internal: boolean;
  icon: LinkIcon;
  channel?: TrackChannel;
}[] = [
  { href: "/", label: "News", internal: true, icon: Newspaper },
  { href: "/about", label: "About", internal: true, icon: Info },
  { href: "/brand", label: "Brand", internal: true, icon: Palette },
  { href: "/mcp", label: "MCP", internal: true, icon: Plug },
  {
    href: EXTENSION_PATH,
    label: "Get AI;DR",
    internal: true,
    icon: RiChromeLine,
    channel: "chrome",
  },
  {
    href: TELEGRAM_URL,
    label: "Telegram",
    internal: false,
    icon: Send,
    channel: "telegram",
  },
  { href: "/data", label: "Data", internal: true, icon: Database },
  { href: "/submit", label: "Submit", internal: true, icon: Plus },
  { href: DUYET_URL, label: "duyet.net", internal: false, icon: Globe },
];
