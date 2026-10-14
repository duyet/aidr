import { idPrefixFromSlug } from "../slug";
import {
  CHANNELS,
  type Channel,
  type EventParams,
  type PageType,
} from "./events";
import { SLUG_RE } from "./schema";

export type CampaignAttribution = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

const ALLOWED = new Set([
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
]);

function clean(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 64);
  if (!trimmed) return undefined;
  if (!SLUG_RE.test(trimmed)) return undefined;
  return trimmed;
}

/** Parse campaign params from a query string. */
export function readCampaign(search: string): CampaignAttribution | null {
  const params = new URLSearchParams(search);
  const out: CampaignAttribution = {};
  for (const key of ALLOWED) {
    const value = clean(params.get(key));
    if (value) out[key as keyof CampaignAttribution] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** "other" is the bucket for unknown sources, never a source value itself. */
function isNamedChannel(source: string): source is Channel {
  return source !== "other" && (CHANNELS as readonly string[]).includes(source);
}

export function landingChannel(c: CampaignAttribution | null): Channel | null {
  const sources = [c?.ref, c?.utm_source].filter((s) => s !== undefined);
  if (sources.length === 0) return null;
  return sources.find(isNamedChannel) ?? "other";
}

const PAGE_TYPE_BY_SEGMENT: Record<string, PageType> = {
  date: "day",
  week: "week",
  weeks: "week",
  calendar: "calendar",
  data: "data",
  subscribe: "subscribe",
  about: "about",
};

export function pageType(pathname: string): PageType {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "home";
  const known = PAGE_TYPE_BY_SEGMENT[parts[0]];
  if (known) return known;
  if (parts.length === 1 && idPrefixFromSlug(parts[0])) return "story";
  return "other";
}

/** Non-null only when the URL itself carries campaign params. */
export function landingFromUrl(
  search: string,
  pathname: string
): EventParams<"channel_landing"> | null {
  const campaign = readCampaign(search);
  const channel = landingChannel(campaign);
  if (!campaign || !channel) return null;
  return {
    channel,
    page_type: pageType(pathname),
    page_path: pathname,
    ...(campaign.utm_medium ? { utm_medium: campaign.utm_medium } : {}),
    ...(campaign.utm_campaign ? { utm_campaign: campaign.utm_campaign } : {}),
    ...(campaign.utm_content ? { utm_content: campaign.utm_content } : {}),
  };
}
