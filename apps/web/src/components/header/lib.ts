import { DUYET_URL, EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";

// Routes whose content is English-only — the EN|VI toggle is disabled
// while on one of these, rather than offering a translation that doesn't
// exist.
export const LANG_TOGGLE_DISABLED_PATHS = new Set([
  "/data",
  "/about",
  "/brand",
  "/mail",
]);

export const SITE_LINKS = [
  { href: "/", label: "News", internal: true },
  { href: "/about", label: "About", internal: true },
  { href: "/brand", label: "Brand", internal: true },
  { href: "/mcp", label: "MCP", internal: true },
  { href: EXTENSION_PATH, label: "Get AI;DR", internal: true },
  { href: TELEGRAM_URL, label: "Telegram", internal: false },
  { href: "/data", label: "Data", internal: true },
  { href: "/submit", label: "Submit", internal: true },
  { href: DUYET_URL, label: "duyet.net", internal: false },
] as const;
