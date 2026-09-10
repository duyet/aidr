import type { TrackParams } from "@aidr/ui/track";

export const EXT_REF = "extension";
export const EXT_UTM_SOURCE = "extension";

const STORAGE_KEY = "aidr_campaign_v1";

export type CampaignAttribution = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  landed_path?: string;
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
  if (!/^[a-zA-Z0-9_.:-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/** Parse campaign params from a query string or URLSearchParams. */
export function readCampaign(
  search: string | URLSearchParams
): CampaignAttribution | null {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const out: CampaignAttribution = {};
  for (const key of ALLOWED) {
    const value = clean(params.get(key));
    if (value) out[key as keyof CampaignAttribution] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function isExtensionCampaign(c: CampaignAttribution | null): boolean {
  if (!c) return false;
  return c.ref === EXT_REF || c.utm_source === EXT_UTM_SOURCE;
}

export function isEmailCampaign(c: CampaignAttribution | null): boolean {
  if (!c) return false;
  return c.utm_source === "email" || c.ref === "email";
}

export function campaignTrackParams(
  c: CampaignAttribution | null
): TrackParams {
  if (!c) return {};
  const out: TrackParams = {};
  if (c.ref) out.ref = c.ref;
  if (c.utm_source) out.utm_source = c.utm_source;
  if (c.utm_medium) out.utm_medium = c.utm_medium;
  if (c.utm_campaign) out.utm_campaign = c.utm_campaign;
  if (c.utm_content) out.utm_content = c.utm_content;
  if (c.landed_path) out.landed_path = c.landed_path;
  if (isExtensionCampaign(c)) out.traffic_source = "extension";
  if (isEmailCampaign(c)) out.traffic_source = "email";
  return out;
}

export function persistCampaign(c: CampaignAttribution): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    // private mode / quota
  }
}

export function loadPersistedCampaign(): CampaignAttribution | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignAttribution;
    if (!parsed || typeof parsed !== "object") return null;
    return readCampaign(
      new URLSearchParams(
        Object.entries(parsed)
          .filter(([k, v]) => ALLOWED.has(k) && typeof v === "string")
          .map(([k, v]) => [k, String(v)])
      )
    );
  } catch {
    return null;
  }
}

/**
 * Prefer URL params (new landing), else sessionStorage (in-session nav).
 * When URL has campaign, persist for later page_views.
 */
export function resolveCampaign(opts: {
  search: string;
  pathname?: string;
}): CampaignAttribution | null {
  const fromUrl = readCampaign(opts.search);
  if (fromUrl) {
    const next = {
      ...fromUrl,
      landed_path: opts.pathname || fromUrl.landed_path,
    };
    persistCampaign(next);
    return next;
  }
  return loadPersistedCampaign();
}
